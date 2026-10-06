"use client";

/* ————————————————————————————————————————
   Session state — now server-backed.

   The public API is unchanged: components still call addToList,
   updateEssay, upsertAidOffer and friends exactly as before. What changed is
   underneath — initial state is hydrated from the database by a server
   component, and every mutator writes through a server action while updating
   local state optimistically so the UI stays instant.

   Authorization lives entirely on the server. The client never sends a
   student id; actions derive it from the session, so a parent has no write
   path and a forged payload buys nothing.
   ———————————————————————————————————————— */

import {
  createContext,
  startTransition,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type {
  Activity,
  AidOffer,
  AidStatus,
  CoursePlanEntry,
  Essay,
  GradeMode,
  ListEntry,
  Profile,
  Recommender,
  School,
  ExtractedCourse,
  TranscriptFile,
  UniversalProfile,
  WeeklyCheckIn,
} from "./types";
import { gradeModeFor } from "./types";
import type { AppSnapshot } from "./db/queries/snapshot";
import * as actions from "./actions/data";
import * as transcriptActions from "./actions/transcript";
import type { AddCoursesResult } from "./actions/transcript";

interface AppState {
  profile: Profile | null;
  setProfile: (p: Profile | null) => void;
  updateProfile: (patch: Partial<Profile>) => void;
  mode: GradeMode;

  list: ListEntry[];
  addToList: (entry: ListEntry) => void;
  removeFromList: (schoolId: string) => void;
  updateListEntry: (schoolId: string, patch: Partial<ListEntry>) => void;

  essays: Essay[];
  addEssay: (e: Essay) => void;
  updateEssay: (id: string, patch: Partial<Essay>) => void;
  /** Snapshot the current draft. Kept server-side in essay_version. */
  saveEssayVersion: (id: string, text: string) => void;
  removeEssay: (id: string) => void;

  recommenders: Recommender[];
  addRecommender: (r: Recommender) => void;
  updateRecommender: (id: string, patch: Partial<Recommender>) => void;
  removeRecommender: (id: string) => void;

  universal: UniversalProfile;
  updateUniversal: (patch: Partial<UniversalProfile>) => void;

  aidStatus: AidStatus;
  setAidStatus: (patch: Partial<AidStatus>) => void;
  aidOffers: AidOffer[];
  upsertAidOffer: (offer: AidOffer) => void;

  coursePlan: CoursePlanEntry[];
  addCourse: (c: CoursePlanEntry) => void;
  updateCourse: (id: string, patch: Partial<CoursePlanEntry>) => void;
  removeCourse: (id: string) => void;

  /** Uploaded transcripts, metadata only. Bytes live server-side. */
  transcripts: TranscriptFile[];
  /** Record a file the upload route has already persisted. */
  addTranscript: (t: TranscriptFile) => void;
  updateTranscript: (id: string, patch: Partial<TranscriptFile>) => void;
  removeTranscript: (id: string) => void;
  /**
   * Add courses the student confirmed off a transcript.
   *
   * Async, unlike every other mutator here, because the caller shows the
   * outcome — how many landed, how many were already there. Optimism is
   * wrong for a bulk write into the academic record.
   */
  addCoursesFromTranscript: (courses: ExtractedCourse[]) => Promise<AddCoursesResult>;

  activities: Activity[];
  addActivity: (a: Activity) => void;
  updateActivity: (id: string, patch: Partial<Activity>) => void;
  removeActivity: (id: string) => void;
  /** Ids in the order the student ranks them. */
  reorderActivities: (ids: string[]) => void;

  checkIns: WeeklyCheckIn[];
  dismissCheckIn: (id: string) => void;
  toggleCheckInAction: (id: string, index: number) => void;

  recentlyViewed: string[];
  markViewed: (schoolId: string) => void;

  /**
   * A school this student's records reference, by id.
   *
   * Synchronous on purpose. Pages resolve schools during render, inside
   * loops over the list, and an async lookup there would mean a loading
   * state on every navigation. The rows come from the database via the
   * snapshot rather than from a compiled-in array.
   *
   * Returns undefined for anything outside the student's own records —
   * the counselor can name a school they've never saved, and that path
   * fetches on demand instead.
   */
  schoolById: (id: string) => School | undefined;

  parentLinked: boolean;
  setParentLinked: (b: boolean) => void;

  /** Gut-feel notes on the decision screen, by school id. */
  decisionNotes: Record<string, string>;
  setDecisionNote: (schoolId: string, text: string) => void;

  /** Notification and sharing switches, persisted in user_preference. */
  preferences: AppSnapshot["preferences"];
  updatePreferences: (patch: Partial<AppSnapshot["preferences"]>) => void;

  resetAll: () => void;
}

const AppContext = createContext<AppState | null>(null);

/** Fire a server action without blocking the optimistic update. */
function fire(p: Promise<unknown>) {
  startTransition(() => {
    void p.catch((err) => console.error("[action]", err));
  });
}

export function AppProvider({
  snapshot,
  children,
}: {
  snapshot: AppSnapshot;
  children: ReactNode;
}) {
  const [profile, setProfile] = useState<Profile | null>(snapshot.profile);
  const [list, setList] = useState<ListEntry[]>(snapshot.list);
  const [essays, setEssays] = useState<Essay[]>(snapshot.essays);
  const [recommenders, setRecommenders] = useState<Recommender[]>(snapshot.recommenders);
  const [universal, setUniversal] = useState<UniversalProfile>(snapshot.universal);
  const [aidStatus, setAidStatusState] = useState<AidStatus>(snapshot.aidStatus);
  const [aidOffers, setAidOffers] = useState<AidOffer[]>(snapshot.aidOffers);
  const [coursePlan, setCoursePlan] = useState<CoursePlanEntry[]>(snapshot.coursePlan);
  const [transcriptFiles, setTranscriptFiles] = useState<TranscriptFile[]>(snapshot.transcripts);
  const [activities, setActivities] = useState<Activity[]>(snapshot.activities);
  const [checkIns, setCheckIns] = useState<WeeklyCheckIn[]>(snapshot.checkIns);
  const [recentlyViewed, setRecentlyViewed] = useState<string[]>(snapshot.recentlyViewed);
  const [parentLinked, setParentLinked] = useState(snapshot.parentLinked);
  const [decisionNotes, setDecisionNotes] = useState(snapshot.decisionNotes);
  const setDecisionNote = useCallback((schoolId: string, text: string) => {
    setDecisionNotes((prev) => ({ ...prev, [schoolId]: text }));
    fire(actions.setDecisionNoteAction(schoolId, text));
  }, []);

  const [preferences, setPreferences] = useState(snapshot.preferences);
  const prefsRef = useRef(snapshot.preferences);

  /*
    Sends the whole object, not the one field that changed.

    Toggling several switches quickly fired several partial upserts at once
    and only the last one survived; three of four writes vanished. Sending
    the merged state makes each write self-contained, so whichever arrives
    last is still correct rather than partial — and it reads from the
    updater's `prev`, not a closure that a fast second click has staled.
  */
  const updatePreferences = useCallback(
    (patch: Partial<AppSnapshot["preferences"]>) => {
      // The ref is the source of truth between renders: a second click lands
      // before React has re-rendered, and reading state from the closure gave
      // it a stale base, so one of the two writes was computed from the wrong
      // starting point and lost. Firing from inside the state updater is not
      // the fix either — React may replay an updater.
      const next = { ...prefsRef.current, ...patch };
      prefsRef.current = next;
      setPreferences(next);
      // The whole object, so whichever request lands last is still complete.
      fire(actions.updatePreferencesAction(next));
    },
    [],
  );

  /* Schools the server hydrated for this student's own records. Not state:
     they change when the server sends a new snapshot, never from the client. */
  const schoolIndex = useMemo(
    () => new Map(snapshot.schools.map((s) => [s.id, s])),
    [snapshot.schools],
  );
  const schoolById = useCallback(
    (id: string) => schoolIndex.get(id),
    [schoolIndex],
  );

  const mode: GradeMode = useMemo(() => {
    if (!profile) return "explore";
    const grade = profile.role === "student" ? profile.gradeLevel : profile.studentGrade;
    return gradeModeFor(grade);
  }, [profile]);

  const updateProfile = useCallback((patch: Partial<Profile>) => {
    setProfile((prev) => (prev ? ({ ...prev, ...patch } as Profile) : prev));
    fire(actions.updateStudentProfileAction(patch as Record<string, unknown>));
  }, []);

  /* ————————————— List ————————————— */

  const addToList = useCallback((entry: ListEntry) => {
    setList((prev) => (prev.some((e) => e.schoolId === entry.schoolId) ? prev : [...prev, entry]));
    fire(actions.addToListAction(entry));
  }, []);

  const removeFromList = useCallback((schoolId: string) => {
    setList((prev) => prev.filter((e) => e.schoolId !== schoolId));
    fire(actions.removeFromListAction(schoolId));
  }, []);

  const updateListEntry = useCallback((schoolId: string, patch: Partial<ListEntry>) => {
    setList((prev) => prev.map((e) => (e.schoolId === schoolId ? { ...e, ...patch } : e)));
    fire(actions.updateListEntryAction(schoolId, patch));
  }, []);

  /* ————————————— Essays ————————————— */

  const addEssay = useCallback((e: Essay) => {
    setEssays((prev) => [...prev, e]);
    // The server assigns the real uuid; swap the optimistic id for it so
    // later updates address the right row.
    fire(
      actions.addEssayAction(e).then((realId) => {
        if (realId) setEssays((prev) => prev.map((x) => (x.id === e.id ? { ...x, id: realId } : x)));
      }),
    );
  }, []);

  const updateEssay = useCallback((id: string, patch: Partial<Essay>) => {
    setEssays((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));
    fire(actions.updateEssayAction(id, patch));
  }, []);

  /*
    "Save version" wrote the snapshot into the essay's `versions` array and
    called updateEssayAction, which persists title, promptText, wordLimit and
    text — and silently drops versions. So an explicit save produced nothing
    on the server. saveEssayVersionAction and the essay_version table both
    already existed; nothing was calling them.
  */
  const saveEssayVersion = useCallback((id: string, text: string) => {
    setEssays((prev) =>
      prev.map((e) =>
        e.id === id
          ? {
              ...e,
              versions: [
                ...e.versions,
                { id: `v-${Date.now()}`, text, savedAt: new Date().toISOString() },
              ],
            }
          : e,
      ),
    );
    fire(actions.saveEssayVersionAction(id, text));
  }, []);

  const removeEssay = useCallback((id: string) => {
    setEssays((prev) => prev.filter((e) => e.id !== id));
    fire(actions.removeEssayAction(id));
  }, []);

  /* ————————————— Recommenders ————————————— */

  const addRecommender = useCallback((r: Recommender) => {
    setRecommenders((prev) => [...prev, r]);
    fire(
      actions.addRecommenderAction(r).then((realId) => {
        if (realId)
          setRecommenders((prev) => prev.map((x) => (x.id === r.id ? { ...x, id: realId } : x)));
      }),
    );
  }, []);

  const updateRecommender = useCallback((id: string, patch: Partial<Recommender>) => {
    setRecommenders((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    fire(actions.updateRecommenderAction(id, patch));
    // schoolIds lives in a join table, so updateRecommenderAction — which
    // writes columns on the recommender row — silently dropped it. The
    // assignment buttons toggled local state and nothing else.
    if (patch.schoolIds) fire(actions.setRecommenderSchoolsAction(id, patch.schoolIds));
  }, []);

  const removeRecommender = useCallback((id: string) => {
    setRecommenders((prev) => prev.filter((r) => r.id !== id));
    fire(actions.removeRecommenderAction(id));
  }, []);

  /* ————————————— Universal & aid ————————————— */

  const updateUniversal = useCallback((patch: Partial<UniversalProfile>) => {
    setUniversal((prev) => ({ ...prev, ...patch }));
    fire(actions.updateUniversalAction(patch));
  }, []);

  const setAidStatus = useCallback((patch: Partial<AidStatus>) => {
    setAidStatusState((prev) => ({ ...prev, ...patch }));
    fire(actions.setAidStatusAction(patch));
  }, []);

  const upsertAidOffer = useCallback((offer: AidOffer) => {
    setAidOffers((prev) => {
      const i = prev.findIndex((o) => o.schoolId === offer.schoolId);
      if (i === -1) return [...prev, offer];
      const next = [...prev];
      next[i] = offer;
      return next;
    });
    fire(actions.upsertAidOfferAction(offer));
  }, []);

  /* ————————————— Planner ————————————— */

  const addCourse = useCallback((c: CoursePlanEntry) => {
    setCoursePlan((prev) => [...prev, c]);
    fire(
      actions.addCourseAction(c).then((realId) => {
        if (realId)
          setCoursePlan((prev) => prev.map((x) => (x.id === c.id ? { ...x, id: realId } : x)));
      }),
    );
  }, []);

  const updateCourse = useCallback((id: string, patch: Partial<CoursePlanEntry>) => {
    setCoursePlan((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
    fire(actions.updateCourseAction(id, patch));
  }, []);

  const removeCourse = useCallback((id: string) => {
    setCoursePlan((prev) => prev.filter((c) => c.id !== id));
    fire(actions.removeCourseAction(id));
  }, []);

  const addTranscript = useCallback((t: TranscriptFile) => {
    setTranscriptFiles((prev) => [t, ...prev]);
  }, []);

  const updateTranscript = useCallback((id: string, patch: Partial<TranscriptFile>) => {
    setTranscriptFiles((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }, []);

  const removeTranscript = useCallback((id: string) => {
    setTranscriptFiles((prev) => prev.filter((t) => t.id !== id));
    fire(transcriptActions.removeTranscriptAction(id));
  }, []);

  const addCoursesFromTranscript = useCallback(async (courses: ExtractedCourse[]) => {
    const result = await transcriptActions.addExtractedCoursesAction(courses);
    // The rows come back with their real ids, so the grid below can edit and
    // delete them straight away without a refresh.
    if (result.ok && result.added.length) {
      setCoursePlan((prev) => [...prev, ...result.added]);
    }
    return result;
  }, []);

  const addActivity = useCallback((a: Activity) => {
    setActivities((prev) => [...prev, a]);
    fire(
      actions.addActivityAction(a).then((realId) => {
        if (realId)
          setActivities((prev) => prev.map((x) => (x.id === a.id ? { ...x, id: realId } : x)));
      }),
    );
  }, []);

  const updateActivity = useCallback((id: string, patch: Partial<Activity>) => {
    setActivities((prev) => prev.map((a) => (a.id === id ? { ...a, ...patch } : a)));
    fire(actions.updateActivityAction(id, patch));
  }, []);

  const removeActivity = useCallback((id: string) => {
    setActivities((prev) => prev.filter((a) => a.id !== id));
    fire(actions.removeActivityAction(id));
  }, []);

  /**
   * Reorder by significance — the order Common App asks for.
   *
   * Stamps every activity's position from the list it is given, so an
   * unranked log becomes fully ranked the first time a student moves
   * anything, rather than leaving a mix of ranked and unranked rows whose
   * relative order is undefined.
   */
  const reorderActivities = useCallback((ids: string[]) => {
    setActivities((prev) => {
      const byId = new Map(prev.map((a) => [a.id, a]));
      return ids
        .map((id, i) => {
          const a = byId.get(id);
          return a ? { ...a, position: i + 1 } : null;
        })
        .filter((a) => a !== null) as Activity[];
    });
    fire(actions.reorderActivitiesAction(ids));
  }, []);

  /* ————————————— Check-ins & misc ————————————— */

  const dismissCheckIn = useCallback((id: string) => {
    setCheckIns((prev) => prev.map((c) => (c.id === id ? { ...c, dismissed: true } : c)));
    fire(actions.dismissCheckInAction(id));
  }, []);

  const toggleCheckInAction = useCallback((id: string, index: number) => {
    setCheckIns((prev) =>
      prev.map((c) =>
        c.id === id
          ? {
              ...c,
              actions: c.actions.map((a, i) => (i === index ? { ...a, done: !a.done } : a)),
            }
          : c,
      ),
    );
    fire(actions.toggleCheckInActionAction(id, index));
  }, []);

  const markViewed = useCallback((schoolId: string) => {
    setRecentlyViewed((prev) => [schoolId, ...prev.filter((s) => s !== schoolId)].slice(0, 6));
    fire(actions.markViewedAction(schoolId));
  }, []);

  const resetAll = useCallback(() => {
    // Local only. Deleting a student's record is a destructive account
    // operation and belongs behind an explicit confirmation in settings,
    // not behind a context helper any screen can call.
    setList([]);
    setEssays([]);
    setRecommenders([]);
    setAidOffers([]);
    setCoursePlan([]);
    setTranscriptFiles([]);
    setActivities([]);
    setCheckIns([]);
    setRecentlyViewed([]);
  }, []);

  const value = useMemo<AppState>(
    () => ({
      profile, setProfile, updateProfile, mode,
      list, addToList, removeFromList, updateListEntry,
      essays, addEssay, updateEssay, removeEssay, saveEssayVersion,
      recommenders, addRecommender, updateRecommender, removeRecommender,
      universal, updateUniversal,
      aidStatus, setAidStatus, aidOffers, upsertAidOffer,
      coursePlan, addCourse, updateCourse, removeCourse,
      transcripts: transcriptFiles, addTranscript, updateTranscript, removeTranscript,
      addCoursesFromTranscript,
      activities, addActivity, updateActivity, removeActivity, reorderActivities,
      checkIns, dismissCheckIn, toggleCheckInAction,
      recentlyViewed, markViewed,
      schoolById,
      parentLinked, setParentLinked,
      decisionNotes, setDecisionNote,
      preferences, updatePreferences,
      resetAll,
    }),
    [
      profile, updateProfile, mode,
      list, addToList, removeFromList, updateListEntry,
      essays, addEssay, updateEssay, removeEssay, saveEssayVersion,
      recommenders, addRecommender, updateRecommender, removeRecommender,
      universal, updateUniversal,
      aidStatus, setAidStatus, aidOffers, upsertAidOffer,
      coursePlan, addCourse, updateCourse, removeCourse,
      transcriptFiles, addTranscript, updateTranscript, removeTranscript,
      addCoursesFromTranscript,
      activities, addActivity, updateActivity, removeActivity, reorderActivities,
      checkIns, dismissCheckIn, toggleCheckInAction,
      recentlyViewed, markViewed, schoolById, parentLinked,
      decisionNotes, setDecisionNote, preferences, updatePreferences, resetAll,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppState {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
