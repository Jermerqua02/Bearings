/* ————————————————————————————————————————
   Student data access.

   Every function takes the viewer and resolves authorization *before*
   querying. Nothing here returns rows the caller isn't entitled to, so a
   server component can hand results straight to the client without a second
   filtering pass.

   The rule this enforces: a parent session never has essay text, counselor
   messages, or interview turns in memory — not hidden by a conditional
   render, simply never fetched.
   ———————————————————————————————————————— */

import { and, asc, desc, eq, gte, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  activities,
  aidOffers,
  aidStatuses,
  checkInActions,
  coursePlanEntries,
  counselorMessages,
  counselorThreads,
  decisionNotes,
  essayShares,
  essayVersions,
  essays,
  interviewTurns,
  listEntries,
  recommenders,
  studentProfiles,
  universalProfiles,
  weeklyCheckIns,
} from "@/lib/db/schema";
import {
  assertCanRead,
  assertCanReadEssay,
  essayVersionCutoff,
  type Viewer,
} from "@/lib/auth/policy";

/* ————————————— Shared view ————————————— */

export async function getListEntries(viewer: Viewer, studentId: string) {
  await assertCanRead(viewer, "listEntries", studentId);
  return db
    .select()
    .from(listEntries)
    .where(eq(listEntries.studentId, studentId))
    .orderBy(asc(listEntries.createdAt));
}

export async function getAidStatus(viewer: Viewer, studentId: string) {
  await assertCanRead(viewer, "aidStatus", studentId);
  const [row] = await db
    .select()
    .from(aidStatuses)
    .where(eq(aidStatuses.studentId, studentId))
    .limit(1);
  return row ?? null;
}

export async function getAidOffers(viewer: Viewer, studentId: string) {
  await assertCanRead(viewer, "aidOffers", studentId);
  return db.select().from(aidOffers).where(eq(aidOffers.studentId, studentId));
}

export async function getDecisionNotes(viewer: Viewer, studentId: string) {
  await assertCanRead(viewer, "decisionNotes", studentId);
  return db.select().from(decisionNotes).where(eq(decisionNotes.studentId, studentId));
}

/* ————————————— Student-private ————————————— */

export async function getStudentProfile(viewer: Viewer, studentId: string) {
  // The profile carries GPA, budget, and values — the "About you" panel,
  // which the counselor page hides from parents.
  await assertCanRead(viewer, "aboutYouPanel", studentId);
  const [row] = await db
    .select()
    .from(studentProfiles)
    .where(eq(studentProfiles.userId, studentId))
    .limit(1);
  return row ?? null;
}

export async function getActivities(viewer: Viewer, studentId: string) {
  await assertCanRead(viewer, "activities", studentId);
  return db
    .select()
    .from(activities)
    .where(eq(activities.studentId, studentId))
    .orderBy(asc(activities.createdAt));
}

export async function getCoursePlan(viewer: Viewer, studentId: string) {
  await assertCanRead(viewer, "coursePlan", studentId);
  return db
    .select()
    .from(coursePlanEntries)
    .where(eq(coursePlanEntries.studentId, studentId))
    .orderBy(asc(coursePlanEntries.year));
}

export async function getUniversalProfile(viewer: Viewer, studentId: string) {
  await assertCanRead(viewer, "universalProfile", studentId);
  const [row] = await db
    .select()
    .from(universalProfiles)
    .where(eq(universalProfiles.studentId, studentId))
    .limit(1);
  return row ?? null;
}

export async function getRecommenders(viewer: Viewer, studentId: string) {
  await assertCanRead(viewer, "essays", studentId);
  return db.select().from(recommenders).where(eq(recommenders.studentId, studentId));
}

export async function getCheckIns(viewer: Viewer, studentId: string) {
  await assertCanRead(viewer, "checkIns", studentId);
  const rows = await db
    .select()
    .from(weeklyCheckIns)
    .where(eq(weeklyCheckIns.studentId, studentId))
    .orderBy(desc(weeklyCheckIns.weekOf));
  if (rows.length === 0) return [];

  const actions = await db
    .select()
    .from(checkInActions)
    .orderBy(asc(checkInActions.sortOrder));
  const byCheckIn = new Map<string, typeof actions>();
  for (const a of actions) {
    const list = byCheckIn.get(a.checkInId) ?? [];
    list.push(a);
    byCheckIn.set(a.checkInId, list);
  }
  return rows.map((r) => ({ ...r, actions: byCheckIn.get(r.id) ?? [] }));
}

/* ————————————— Essays ————————————— */

/**
 * A student gets all their essays. A parent gets only those with a live
 * share grant — the query filters on the join, so unshared drafts are never
 * read out of the database, let alone sent to the client.
 */
export async function getEssays(viewer: Viewer, studentId: string) {
  if (viewer.role === "student") {
    await assertCanRead(viewer, "essays", studentId);
    return db
      .select()
      .from(essays)
      .where(eq(essays.studentId, studentId))
      .orderBy(asc(essays.createdAt));
  }

  return db
    .select({
      id: essays.id,
      studentId: essays.studentId,
      title: essays.title,
      promptText: essays.promptText,
      schoolId: essays.schoolId,
      wordLimit: essays.wordLimit,
      text: essays.text,
      createdAt: essays.createdAt,
      updatedAt: essays.updatedAt,
    })
    .from(essays)
    .innerJoin(essayShares, eq(essayShares.essayId, essays.id))
    .where(
      and(
        eq(essays.studentId, studentId),
        eq(essayShares.grantedToUserId, viewer.userId),
        isNull(essayShares.revokedAt),
      ),
    )
    .orderBy(asc(essays.createdAt));
}

/** Version history, cut off at the share boundary for parents. */
export async function getEssayVersions(viewer: Viewer, essayId: string) {
  const gate = await essayVersionCutoff(viewer, essayId);
  if (!gate.allowed) return [];

  const where = gate.since
    ? and(eq(essayVersions.essayId, essayId), gte(essayVersions.savedAt, gate.since))
    : eq(essayVersions.essayId, essayId);

  return db.select().from(essayVersions).where(where).orderBy(desc(essayVersions.savedAt));
}

export async function getEssay(viewer: Viewer, essayId: string) {
  await assertCanReadEssay(viewer, essayId);
  const [row] = await db.select().from(essays).where(eq(essays.id, essayId)).limit(1);
  return row ?? null;
}

/* ————————————— Never parent-readable ————————————— */

export async function getCounselorThreads(viewer: Viewer, studentId: string) {
  // canRead() returns false for any parent here — counselorThreads is not in
  // PARENT_READABLE, so this throws before a query runs.
  await assertCanRead(viewer, "counselorThreads", studentId);
  return db
    .select()
    .from(counselorThreads)
    .where(eq(counselorThreads.studentId, studentId))
    .orderBy(desc(counselorThreads.updatedAt));
}

export async function getThreadMessages(viewer: Viewer, threadId: string) {
  const [thread] = await db
    .select({ studentId: counselorThreads.studentId })
    .from(counselorThreads)
    .where(eq(counselorThreads.id, threadId))
    .limit(1);
  if (!thread) return [];
  await assertCanRead(viewer, "counselorThreads", thread.studentId);
  return db
    .select()
    .from(counselorMessages)
    .where(eq(counselorMessages.threadId, threadId))
    .orderBy(asc(counselorMessages.createdAt));
}

export async function getInterviewTurns(viewer: Viewer, sessionId: string) {
  await assertCanRead(viewer, "interviewTurns", viewer.userId);
  return db
    .select()
    .from(interviewTurns)
    .where(eq(interviewTurns.sessionId, sessionId))
    .orderBy(asc(interviewTurns.sortOrder));
}
