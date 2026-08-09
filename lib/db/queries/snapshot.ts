/* ————————————————————————————————————————
   The app snapshot.

   Loads every slice the client needs in one server pass and maps DB rows
   back to the domain shapes in lib/types.ts — so profile-context can hand
   the result straight to components without any of them changing.

   Authorization happens inside the query layer, per slice. For a parent, the
   private slices come back empty because they were never fetched.
   ———————————————————————————————————————— */

import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { recentlyViewed as recentlyViewedTable } from "@/lib/db/schema";
import {
  getActivities,
  getAidOffers,
  getAidStatus,
  getCheckIns,
  getCoursePlan,
  getEssays,
  getListEntries,
  getRecommenders,
  getStudentProfile,
  getUniversalProfile,
} from "@/lib/db/queries/student";
import { linkedStudentIdFor, type Viewer } from "@/lib/auth/policy";
import { db as _db } from "@/lib/db";
import { parentProfiles } from "@/lib/db/schema";
import type {
  Activity,
  Role,
  AidOffer,
  AidStatus,
  CoursePlanEntry,
  Essay,
  GradeLevel,
  ListEntry,
  Profile,
  Recommender,
  UniversalProfile,
  WeeklyCheckIn,
} from "@/lib/types";

export interface AppSnapshot {
  profile: Profile | null;
  list: ListEntry[];
  essays: Essay[];
  recommenders: Recommender[];
  universal: UniversalProfile;
  aidStatus: AidStatus;
  aidOffers: AidOffer[];
  coursePlan: CoursePlanEntry[];
  activities: Activity[];
  checkIns: WeeklyCheckIn[];
  recentlyViewed: string[];
  parentLinked: boolean;
  /** Whose records these are. A parent is viewing their linked student's. */
  subjectStudentId: string | null;
  viewerRole: Role;
}

export const emptyUniversal: UniversalProfile = {
  legalName: "",
  preferredName: "",
  dateOfBirth: "",
  email: "",
  phone: "",
  address: "",
  citizenship: "",
  demographics: "",
  parentEducation: "",
  highSchoolName: "",
  highSchoolCity: "",
  gradYear: "",
  honors: [],
  additionalInfo: "",
};

/** The shape a signed-out visitor gets, so public pages still render. */
export function emptySnapshotFor(role: Role | null): AppSnapshot {
  return emptySnapshot(role ?? "student");
}

function emptySnapshot(role: Role): AppSnapshot {
  return {
    profile: null,
    list: [],
    essays: [],
    recommenders: [],
    universal: emptyUniversal,
    aidStatus: { fafsa: "not-started", cssProfile: "not-started" },
    aidOffers: [],
    coursePlan: [],
    activities: [],
    checkIns: [],
    recentlyViewed: [],
    parentLinked: false,
    subjectStudentId: null,
    viewerRole: role,
  };
}

/** Slices a parent must never receive come back empty rather than throwing. */
async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch {
    return fallback;
  }
}

export async function loadSnapshot(viewer: Viewer): Promise<AppSnapshot> {
  const studentId =
    // A parent reads their linked student; everyone else reads their own
    // records. Admin is included here deliberately — an operator who walks
    // onboarding to test the product should see what they just entered, and
    // reading your *own* rows is not what the privacy boundary guards.
    // Cross-account admin reads go through lib/db/queries/admin.ts.
    viewer.role === "parent" ? await linkedStudentIdFor(viewer.userId) : viewer.userId;

  const snap = emptySnapshot(viewer.role);
  snap.subjectStudentId = studentId;
  snap.parentLinked =
    viewer.role === "parent" ? Boolean(studentId) : await hasActiveLink(viewer.userId);

  if (viewer.role === "parent" && !studentId) {
    snap.profile = await loadParentProfile(viewer.userId);
    return snap;
  }
  if (!studentId) return snap;

  const [
    profileRow,
    list,
    essayRows,
    recRows,
    universalRow,
    aidStatusRow,
    aidOfferRows,
    courseRows,
    activityRows,
    checkInRows,
    viewedRows,
  ] = await Promise.all([
    safe(() => getStudentProfile(viewer, studentId), null),
    safe(() => getListEntries(viewer, studentId), []),
    safe(() => getEssays(viewer, studentId), []),
    safe(() => getRecommenders(viewer, studentId), []),
    safe(() => getUniversalProfile(viewer, studentId), null),
    safe(() => getAidStatus(viewer, studentId), null),
    safe(() => getAidOffers(viewer, studentId), []),
    safe(() => getCoursePlan(viewer, studentId), []),
    safe(() => getActivities(viewer, studentId), []),
    safe(() => getCheckIns(viewer, studentId), []),
    safe(
      () =>
        db
          .select({ schoolId: recentlyViewedTable.schoolId })
          .from(recentlyViewedTable)
          .where(eq(recentlyViewedTable.userId, viewer.userId))
          .orderBy(desc(recentlyViewedTable.viewedAt))
          .limit(6),
      [] as { schoolId: string }[],
    ),
  ]);

  snap.profile =
    viewer.role === "parent"
      ? await loadParentProfile(viewer.userId)
      : profileRow
        ? toStudentProfile(profileRow)
        : null;

  snap.list = list.map((r) => ({
    schoolId: r.schoolId,
    tier: r.tier,
    plan: r.plan ?? undefined,
    status: r.status,
    outcome: r.outcome ?? undefined,
    notes: r.notes ?? undefined,
  }));

  snap.essays = essayRows.map((e) => ({
    id: e.id,
    title: e.title,
    promptText: e.promptText,
    schoolId: e.schoolId ?? undefined,
    wordLimit: e.wordLimit,
    text: e.text,
    versions: [], // loaded on demand — see getEssayVersions
  }));

  snap.recommenders = recRows.map((r) => ({
    id: r.id,
    name: r.name,
    roleTitle: r.roleTitle,
    type: r.type,
    schoolIds: [],
    status: r.status,
  }));

  if (universalRow) {
    snap.universal = {
      legalName: universalRow.legalName,
      preferredName: universalRow.preferredName,
      dateOfBirth: universalRow.dateOfBirth,
      email: universalRow.email,
      phone: universalRow.phone,
      address: universalRow.address,
      citizenship: universalRow.citizenship,
      demographics: universalRow.demographics,
      parentEducation: universalRow.parentEducation,
      highSchoolName: universalRow.highSchoolName,
      highSchoolCity: universalRow.highSchoolCity,
      gradYear: universalRow.gradYear,
      honors: universalRow.honors,
      additionalInfo: universalRow.additionalInfo,
    };
  }

  if (aidStatusRow) {
    snap.aidStatus = { fafsa: aidStatusRow.fafsa, cssProfile: aidStatusRow.cssProfile };
  }

  snap.aidOffers = aidOfferRows.map((a) => ({
    schoolId: a.schoolId,
    coa: a.coa,
    grants: a.grants,
    loans: a.loans,
    workStudy: a.workStudy,
  }));

  snap.coursePlan = courseRows.map((c) => ({
    id: c.id,
    year: c.year as GradeLevel,
    subject: c.subject,
    name: c.name,
    level: c.level,
    status: c.status,
    grade: c.grade ?? undefined,
  }));

  snap.activities = activityRows.map((a) => ({
    id: a.id,
    name: a.name,
    role: a.role,
    hoursPerWeek: a.hoursPerWeek,
    weeksPerYear: a.weeksPerYear,
    description: a.description,
    yearsInvolved: a.yearsInvolved as GradeLevel[],
    leadership: a.leadership,
  }));

  snap.checkIns = checkInRows.map((c) => ({
    id: c.id,
    weekOf: String(c.weekOf),
    mode: c.mode,
    dismissed: c.dismissed,
    actions: c.actions.map((a) => ({ text: a.text, done: a.done })),
  })) as WeeklyCheckIn[];

  snap.recentlyViewed = viewedRows.map((v) => v.schoolId);

  return snap;
}

async function hasActiveLink(studentId: string): Promise<boolean> {
  const { parentStudentLinks } = await import("@/lib/db/schema");
  const { and, eq: eqOp } = await import("drizzle-orm");
  const [row] = await db
    .select({ id: parentStudentLinks.id })
    .from(parentStudentLinks)
    .where(and(eqOp(parentStudentLinks.studentId, studentId), eqOp(parentStudentLinks.status, "active")))
    .limit(1);
  return Boolean(row);
}

async function loadParentProfile(userId: string): Promise<Profile | null> {
  const [row] = await _db
    .select()
    .from(parentProfiles)
    .where(eq(parentProfiles.userId, userId))
    .limit(1);
  if (!row) return null;
  return {
    role: "parent",
    firstName: row.firstName,
    relationship: row.relationship,
    studentGrade: row.studentGrade as GradeLevel,
    budgetPerYear: row.budgetPerYear ?? undefined,
    priorities: row.priorities,
    biggestWorry: row.biggestWorry,
    involvementLevel: row.involvementLevel,
  };
}

type StudentRow = NonNullable<Awaited<ReturnType<typeof getStudentProfile>>>;

function toStudentProfile(r: StudentRow): Profile {
  return {
    role: "student",
    firstName: r.firstName,
    gradeLevel: r.gradeLevel as GradeLevel,
    gpa: {
      unweighted: r.selfReportedGpaUnweighted ?? undefined,
      weighted: r.selfReportedGpaWeighted ?? undefined,
    },
    rigor: { apCount: r.apCount, ibCount: r.ibCount, honorsCount: r.honorsCount },
    testScores: {
      sat: r.sat ?? undefined,
      act: r.act ?? undefined,
      planningToTest: r.planningToTest,
    },
    intendedMajors: r.intendedMajors,
    undecided: r.undecided,
    // Activities have a single home now (the activities table); the profile
    // field is kept for type compatibility and filled from that slice.
    activities: [],
    geography: {
      regions: r.regions,
      maxDistanceMiles: r.maxDistanceMiles ?? undefined,
    },
    campus: { sizes: r.campusSizes, settings: r.campusSettings },
    budget: {
      maxPerYear: r.budgetMaxPerYear ?? undefined,
      willFileFafsa: r.willFileFafsa,
    },
    values: r.values as Profile extends { values: infer V } ? V : never,
    throughline: r.throughlineParagraph
      ? {
          paragraph: r.throughlineParagraph,
          evidence: r.throughlineEvidence ?? [],
          stillForming: r.throughlineStillForming ?? false,
        }
      : undefined,
  } as Profile;
}
