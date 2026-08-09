"use client";

/* ————————————————————————————————————————
   Session state — client-side only (React context, no persistence).
   Seeded with a demo student so every screen renders with content.
   ———————————————————————————————————————— */

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
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
  UniversalProfile,
  WeeklyCheckIn,
} from "./types";
import { gradeModeFor } from "./types";

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

  activities: Activity[];
  addActivity: (a: Activity) => void;
  updateActivity: (id: string, patch: Partial<Activity>) => void;
  removeActivity: (id: string) => void;

  checkIns: WeeklyCheckIn[];
  dismissCheckIn: (id: string) => void;
  toggleCheckInAction: (id: string, index: number) => void;

  recentlyViewed: string[];
  markViewed: (schoolId: string) => void;

  parentLinked: boolean;
  setParentLinked: (b: boolean) => void;

  resetAll: () => void;
}

const AppContext = createContext<AppState | null>(null);

/* ————————————— Demo seed ————————————— */

export const demoStudent: Profile = {
  role: "student",
  firstName: "Maya",
  gradeLevel: 12,
  gpa: { unweighted: 3.6, weighted: 4.1 },
  rigor: { apCount: 5, ibCount: 0, honorsCount: 3 },
  testScores: { sat: 1310, planningToTest: false },
  intendedMajors: ["Biology"],
  undecided: false,
  activities: [],
  geography: { regions: ["midwest", "northeast"], maxDistanceMiles: 500 },
  campus: { sizes: ["medium", "large"], settings: ["college-town", "suburban"] },
  budget: { maxPerYear: 30000, willFileFafsa: true },
  values: ["research-access", "mental-health-support", "study-abroad"],
};

const demoActivities: Activity[] = [
  {
    id: "a1",
    name: "Science Olympiad",
    role: "Team captain",
    hoursPerWeek: 5,
    weeksPerYear: 30,
    description:
      "Led a 15-person team; medaled at state in Anatomy & Physiology.",
    yearsInvolved: [9, 10, 11, 12],
    leadership: true,
  },
  {
    id: "a2",
    name: "Hospital volunteering",
    role: "Volunteer",
    hoursPerWeek: 3,
    weeksPerYear: 40,
    description: "Patient transport and family waiting-room support.",
    yearsInvolved: [10, 11, 12],
    leadership: false,
  },
  {
    id: "a3",
    name: "Part-time job — vet clinic",
    role: "Kennel assistant",
    hoursPerWeek: 8,
    weeksPerYear: 45,
    description: "Animal care, client communication, cleaning. Real work.",
    yearsInvolved: [11, 12],
    leadership: false,
  },
];

const demoList: ListEntry[] = [
  { schoolId: "umich", tier: "reach", plan: "EA", status: "in-progress" },
  { schoolId: "case-western", tier: "target", plan: "EA", status: "submitted" },
  { schoolId: "wisconsin", tier: "target", plan: "EA", status: "in-progress" },
  { schoolId: "college-of-wooster", tier: "likely", plan: "EA", status: "submitted" },
  { schoolId: "miami-ohio", tier: "likely", plan: "EA", status: "materials-received" },
  { schoolId: "pitt", tier: "target", plan: "rolling", status: "considering" },
];

const demoEssays: Essay[] = [
  {
    id: "e1",
    title: "Personal statement",
    promptText:
      "Share an essay on any topic of your choice. It can be one you've already written, or one that responds to a different prompt.",
    wordLimit: 650,
    text: "The kennel at Dr. Alvarez's clinic is loudest at 7 a.m., which is when I do my best thinking...",
    versions: [
      {
        id: "v1",
        text: "Draft about Science Olympiad (retired — too resume-like).",
        savedAt: "2026-07-20T14:00:00Z",
      },
    ],
  },
  {
    id: "e2",
    title: "Why Case Western?",
    schoolId: "case-western",
    promptText:
      "In 250 words or fewer, tell us why Case Western Reserve is a good fit for you.",
    wordLimit: 250,
    text: "",
    versions: [],
  },
];

const demoRecommenders: Recommender[] = [
  {
    id: "r1",
    name: "Ms. Patel",
    roleTitle: "AP Biology teacher",
    type: "teacher",
    schoolIds: ["umich", "case-western", "wisconsin"],
    status: "submitted",
  },
  {
    id: "r2",
    name: "Mr. Donnelly",
    roleTitle: "School counselor",
    type: "counselor",
    schoolIds: ["umich", "case-western", "wisconsin", "college-of-wooster", "miami-ohio"],
    status: "in-progress",
  },
];

const emptyUniversal: UniversalProfile = {
  legalName: "Maya Chen",
  preferredName: "Maya",
  dateOfBirth: "2009-03-14",
  email: "",
  phone: "",
  address: "",
  citizenship: "U.S. citizen",
  demographics: "",
  parentEducation: "Mother: bachelor's · Father: some college",
  highSchoolName: "Jefferson High School",
  highSchoolCity: "Columbus, OH",
  gradYear: "2027",
  honors: ["State medal, Science Olympiad (Anatomy & Physiology)", "National Honor Society"],
  additionalInfo: "",
};

const demoCourses: CoursePlanEntry[] = [
  { id: "c1", year: 9, subject: "Science", name: "Biology", level: "honors", status: "completed", grade: "A" },
  { id: "c2", year: 9, subject: "Math", name: "Geometry", level: "regular", status: "completed", grade: "A-" },
  { id: "c3", year: 10, subject: "Science", name: "Chemistry", level: "honors", status: "completed", grade: "B+" },
  { id: "c4", year: 10, subject: "Math", name: "Algebra II", level: "regular", status: "completed", grade: "A-" },
  { id: "c5", year: 11, subject: "Science", name: "AP Biology", level: "ap", status: "completed", grade: "A" },
  { id: "c6", year: 11, subject: "Math", name: "Pre-Calculus", level: "honors", status: "completed", grade: "B+" },
  { id: "c7", year: 11, subject: "English", name: "AP Language", level: "ap", status: "completed", grade: "A-" },
  { id: "c8", year: 12, subject: "Science", name: "AP Chemistry", level: "ap", status: "in-progress" },
  { id: "c9", year: 12, subject: "Math", name: "AP Statistics", level: "ap", status: "in-progress" },
  { id: "c10", year: 12, subject: "English", name: "AP Literature", level: "ap", status: "in-progress" },
];

function currentWeekISO(): string {
  const d = new Date();
  d.setDate(d.getDate() - d.getDay() + 1); // Monday
  return d.toISOString().slice(0, 10);
}

const demoCheckIns: WeeklyCheckIn[] = [
  {
    id: "w-current",
    weekOf: currentWeekISO(),
    mode: "apply",
    actions: [
      { text: "Finish the Case Western supplement — it's the only empty essay on a school you love", done: false },
      { text: "Nudge Mr. Donnelly (kindly) — his letter is still in progress and Michigan's EA deadline is close", done: false },
      { text: "Add one more financial likely: look at Truman State's net price with me", done: false },
    ],
    dismissed: false,
  },
  {
    id: "w-past-1",
    weekOf: "2026-07-27",
    mode: "apply",
    actions: [
      { text: "Draft personal statement opening", done: true },
      { text: "Confirm teacher recommenders", done: true },
      { text: "Set up Common App account", done: true },
    ],
    dismissed: true,
  },
];

/* ————————————— Provider ————————————— */

export function AppProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>(demoStudent);
  const [list, setList] = useState<ListEntry[]>(demoList);
  const [essays, setEssays] = useState<Essay[]>(demoEssays);
  const [recommenders, setRecommenders] = useState<Recommender[]>(demoRecommenders);
  const [universal, setUniversal] = useState<UniversalProfile>(emptyUniversal);
  const [aidStatus, setAidStatusState] = useState<AidStatus>({
    fafsa: "in-progress",
    cssProfile: "not-started",
  });
  const [aidOffers, setAidOffers] = useState<AidOffer[]>([]);
  const [coursePlan, setCoursePlan] = useState<CoursePlanEntry[]>(demoCourses);
  const [activities, setActivities] = useState<Activity[]>(demoActivities);
  const [checkIns, setCheckIns] = useState<WeeklyCheckIn[]>(demoCheckIns);
  const [recentlyViewed, setRecentlyViewed] = useState<string[]>([
    "case-western",
    "wisconsin",
  ]);
  const [parentLinked, setParentLinked] = useState(false);

  const mode: GradeMode = useMemo(() => {
    if (!profile) return "explore";
    const grade =
      profile.role === "student" ? profile.gradeLevel : profile.studentGrade;
    return gradeModeFor(grade);
  }, [profile]);

  const updateProfile = useCallback((patch: Partial<Profile>) => {
    setProfile((prev) => (prev ? ({ ...prev, ...patch } as Profile) : prev));
  }, []);

  const addToList = useCallback((entry: ListEntry) => {
    setList((prev) =>
      prev.some((e) => e.schoolId === entry.schoolId) ? prev : [...prev, entry]
    );
  }, []);
  const removeFromList = useCallback((schoolId: string) => {
    setList((prev) => prev.filter((e) => e.schoolId !== schoolId));
  }, []);
  const updateListEntry = useCallback(
    (schoolId: string, patch: Partial<ListEntry>) => {
      setList((prev) =>
        prev.map((e) => (e.schoolId === schoolId ? { ...e, ...patch } : e))
      );
    },
    []
  );

  const addEssay = useCallback((e: Essay) => {
    setEssays((prev) => [...prev, e]);
  }, []);
  const updateEssay = useCallback((id: string, patch: Partial<Essay>) => {
    setEssays((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  }, []);
  const removeEssay = useCallback((id: string) => {
    setEssays((prev) => prev.filter((e) => e.id !== id));
  }, []);

  const addRecommender = useCallback((r: Recommender) => {
    setRecommenders((prev) => [...prev, r]);
  }, []);
  const updateRecommender = useCallback(
    (id: string, patch: Partial<Recommender>) => {
      setRecommenders((prev) =>
        prev.map((r) => (r.id === id ? { ...r, ...patch } : r))
      );
    },
    []
  );
  const removeRecommender = useCallback((id: string) => {
    setRecommenders((prev) => prev.filter((r) => r.id !== id));
  }, []);

  const updateUniversal = useCallback((patch: Partial<UniversalProfile>) => {
    setUniversal((prev) => ({ ...prev, ...patch }));
  }, []);

  const setAidStatus = useCallback((patch: Partial<AidStatus>) => {
    setAidStatusState((prev) => ({ ...prev, ...patch }));
  }, []);
  const upsertAidOffer = useCallback((offer: AidOffer) => {
    setAidOffers((prev) => {
      const i = prev.findIndex((o) => o.schoolId === offer.schoolId);
      if (i === -1) return [...prev, offer];
      const next = [...prev];
      next[i] = offer;
      return next;
    });
  }, []);

  const addCourse = useCallback((c: CoursePlanEntry) => {
    setCoursePlan((prev) => [...prev, c]);
  }, []);
  const updateCourse = useCallback(
    (id: string, patch: Partial<CoursePlanEntry>) => {
      setCoursePlan((prev) =>
        prev.map((c) => (c.id === id ? { ...c, ...patch } : c))
      );
    },
    []
  );
  const removeCourse = useCallback((id: string) => {
    setCoursePlan((prev) => prev.filter((c) => c.id !== id));
  }, []);

  const addActivity = useCallback((a: Activity) => {
    setActivities((prev) => [...prev, a]);
  }, []);
  const updateActivity = useCallback((id: string, patch: Partial<Activity>) => {
    setActivities((prev) =>
      prev.map((a) => (a.id === id ? { ...a, ...patch } : a))
    );
  }, []);
  const removeActivity = useCallback((id: string) => {
    setActivities((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const dismissCheckIn = useCallback((id: string) => {
    setCheckIns((prev) =>
      prev.map((c) => (c.id === id ? { ...c, dismissed: true } : c))
    );
  }, []);
  const toggleCheckInAction = useCallback((id: string, index: number) => {
    setCheckIns((prev) =>
      prev.map((c) =>
        c.id === id
          ? {
              ...c,
              actions: c.actions.map((a, i) =>
                i === index ? { ...a, done: !a.done } : a
              ),
            }
          : c
      )
    );
  }, []);

  const markViewed = useCallback((schoolId: string) => {
    setRecentlyViewed((prev) =>
      [schoolId, ...prev.filter((id) => id !== schoolId)].slice(0, 6)
    );
  }, []);

  const resetAll = useCallback(() => {
    setProfile(null);
    setList([]);
    setEssays([]);
    setRecommenders([]);
    setUniversal(emptyUniversal);
    setAidOffers([]);
    setCoursePlan([]);
    setActivities([]);
    setCheckIns([]);
    setRecentlyViewed([]);
    setParentLinked(false);
  }, []);

  const value = useMemo(
    () => ({
      profile,
      setProfile,
      updateProfile,
      mode,
      list,
      addToList,
      removeFromList,
      updateListEntry,
      essays,
      addEssay,
      updateEssay,
      removeEssay,
      recommenders,
      addRecommender,
      updateRecommender,
      removeRecommender,
      universal,
      updateUniversal,
      aidStatus,
      setAidStatus,
      aidOffers,
      upsertAidOffer,
      coursePlan,
      addCourse,
      updateCourse,
      removeCourse,
      activities,
      addActivity,
      updateActivity,
      removeActivity,
      checkIns,
      dismissCheckIn,
      toggleCheckInAction,
      recentlyViewed,
      markViewed,
      parentLinked,
      setParentLinked,
      resetAll,
    }),
    [
      profile, updateProfile, mode,
      list, addToList, removeFromList, updateListEntry,
      essays, addEssay, updateEssay, removeEssay,
      recommenders, addRecommender, updateRecommender, removeRecommender,
      universal, updateUniversal,
      aidStatus, setAidStatus, aidOffers, upsertAidOffer,
      coursePlan, addCourse, updateCourse, removeCourse,
      activities, addActivity, updateActivity, removeActivity,
      checkIns, dismissCheckIn, toggleCheckInAction,
      recentlyViewed, markViewed, parentLinked, resetAll,
    ]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppState {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
