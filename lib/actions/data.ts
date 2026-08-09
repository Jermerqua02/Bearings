/* ————————————————————————————————————————
   Data mutations.

   One action per mutator on the profile-context API. Every action resolves
   the viewer server-side and calls assertCanWrite — only the owning student
   may modify their records, so a parent has no write path at all.

   The client never sends a student id; it's derived from the session. That
   closes the hole where the old client passed the whole Profile into every
   call and the server would have had to trust it.
   ———————————————————————————————————————— */

"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import {
  activities,
  aidOffers,
  aidStatuses,
  checkInActions,
  coursePlanEntries,
  essayVersions,
  essays,
  listEntries,
  recentlyViewed,
  recommenders,
  studentProfiles,
  universalProfiles,
  weeklyCheckIns,
} from "@/lib/db/schema";
import { requireStudent, requireViewer } from "@/lib/auth/policy";
import type {
  Activity,
  AidOffer,
  AidStatus,
  CoursePlanEntry,
  Essay,
  ListEntry,
  Recommender,
  UniversalProfile,
} from "@/lib/types";

const touch = { updatedAt: new Date() };

/* ————————————— List ————————————— */

export async function addToListAction(entry: ListEntry) {
  const s = await requireStudent();
  await db
    .insert(listEntries)
    .values({
      studentId: s.userId,
      schoolId: entry.schoolId,
      tier: entry.tier,
      plan: entry.plan ?? null,
      status: entry.status,
      outcome: entry.outcome ?? null,
      notes: entry.notes ?? null,
    })
    .onConflictDoNothing();
  revalidatePath("/list");
}

export async function removeFromListAction(schoolId: string) {
  const s = await requireStudent();
  await db
    .delete(listEntries)
    .where(and(eq(listEntries.studentId, s.userId), eq(listEntries.schoolId, schoolId)));
  revalidatePath("/list");
}

export async function updateListEntryAction(schoolId: string, patch: Partial<ListEntry>) {
  const s = await requireStudent();
  await db
    .update(listEntries)
    .set({
      ...(patch.tier !== undefined ? { tier: patch.tier, tierOverridden: true } : {}),
      ...(patch.plan !== undefined ? { plan: patch.plan ?? null } : {}),
      ...(patch.status !== undefined ? { status: patch.status } : {}),
      ...(patch.outcome !== undefined ? { outcome: patch.outcome ?? null } : {}),
      ...(patch.notes !== undefined ? { notes: patch.notes ?? null } : {}),
      ...touch,
    })
    .where(and(eq(listEntries.studentId, s.userId), eq(listEntries.schoolId, schoolId)));
  revalidatePath("/list");
}

/* ————————————— Essays ————————————— */

export async function addEssayAction(e: Essay) {
  const s = await requireStudent();
  const [row] = await db
    .insert(essays)
    .values({
      studentId: s.userId,
      title: e.title,
      promptText: e.promptText,
      schoolId: e.schoolId ?? null,
      wordLimit: e.wordLimit,
      text: e.text,
    })
    .returning({ id: essays.id });
  revalidatePath("/apply");
  return row.id;
}

export async function updateEssayAction(id: string, patch: Partial<Essay>) {
  const s = await requireStudent();
  await db
    .update(essays)
    .set({
      ...(patch.title !== undefined ? { title: patch.title } : {}),
      ...(patch.promptText !== undefined ? { promptText: patch.promptText } : {}),
      ...(patch.wordLimit !== undefined ? { wordLimit: patch.wordLimit } : {}),
      ...(patch.text !== undefined ? { text: patch.text } : {}),
      ...touch,
    })
    .where(and(eq(essays.id, id), eq(essays.studentId, s.userId)));
  revalidatePath("/apply");
}

/** Snapshots the current text as a version. */
export async function saveEssayVersionAction(id: string, text: string) {
  const s = await requireStudent();
  const [owned] = await db
    .select({ id: essays.id })
    .from(essays)
    .where(and(eq(essays.id, id), eq(essays.studentId, s.userId)))
    .limit(1);
  if (!owned) return;
  await db.insert(essayVersions).values({ essayId: id, text, savedAt: new Date() });
  revalidatePath("/apply");
}

export async function removeEssayAction(id: string) {
  const s = await requireStudent();
  await db.delete(essays).where(and(eq(essays.id, id), eq(essays.studentId, s.userId)));
  revalidatePath("/apply");
}

/* ————————————— Recommenders ————————————— */

export async function addRecommenderAction(r: Recommender) {
  const s = await requireStudent();
  const [row] = await db
    .insert(recommenders)
    .values({
      studentId: s.userId,
      name: r.name,
      roleTitle: r.roleTitle,
      type: r.type,
      status: r.status,
    })
    .returning({ id: recommenders.id });
  revalidatePath("/apply");
  return row.id;
}

export async function updateRecommenderAction(id: string, patch: Partial<Recommender>) {
  const s = await requireStudent();
  await db
    .update(recommenders)
    .set({
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.roleTitle !== undefined ? { roleTitle: patch.roleTitle } : {}),
      ...(patch.type !== undefined ? { type: patch.type } : {}),
      ...(patch.status !== undefined ? { status: patch.status } : {}),
      ...touch,
    })
    .where(and(eq(recommenders.id, id), eq(recommenders.studentId, s.userId)));
  revalidatePath("/apply");
}

export async function removeRecommenderAction(id: string) {
  const s = await requireStudent();
  await db.delete(recommenders).where(and(eq(recommenders.id, id), eq(recommenders.studentId, s.userId)));
  revalidatePath("/apply");
}

/* ————————————— Universal profile (PII) ————————————— */

export async function updateUniversalAction(patch: Partial<UniversalProfile>) {
  const s = await requireStudent();
  await db
    .insert(universalProfiles)
    .values({ studentId: s.userId, ...patch })
    .onConflictDoUpdate({
      target: universalProfiles.studentId,
      set: { ...patch, ...touch },
    });
  revalidatePath("/apply");
}

/* ————————————— Aid ————————————— */

export async function setAidStatusAction(patch: Partial<AidStatus>) {
  const s = await requireStudent();
  await db
    .insert(aidStatuses)
    .values({ studentId: s.userId, ...patch })
    .onConflictDoUpdate({ target: aidStatuses.studentId, set: { ...patch, ...touch } });
  revalidatePath("/apply");
}

export async function upsertAidOfferAction(offer: AidOffer) {
  const s = await requireStudent();
  await db
    .insert(aidOffers)
    .values({ studentId: s.userId, ...offer })
    .onConflictDoUpdate({
      target: [aidOffers.studentId, aidOffers.schoolId],
      set: { coa: offer.coa, grants: offer.grants, loans: offer.loans, workStudy: offer.workStudy, ...touch },
    });
  revalidatePath("/decide");
}

/* ————————————— Planner ————————————— */

export async function addCourseAction(c: CoursePlanEntry) {
  const s = await requireStudent();
  const [row] = await db
    .insert(coursePlanEntries)
    .values({
      studentId: s.userId,
      year: c.year,
      subject: c.subject,
      name: c.name,
      level: c.level,
      status: c.status,
      grade: c.grade ?? null,
    })
    .returning({ id: coursePlanEntries.id });
  revalidatePath("/planner");
  return row.id;
}

export async function updateCourseAction(id: string, patch: Partial<CoursePlanEntry>) {
  const s = await requireStudent();
  await db
    .update(coursePlanEntries)
    .set({
      ...(patch.year !== undefined ? { year: patch.year } : {}),
      ...(patch.subject !== undefined ? { subject: patch.subject } : {}),
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.level !== undefined ? { level: patch.level } : {}),
      ...(patch.status !== undefined ? { status: patch.status } : {}),
      ...(patch.grade !== undefined ? { grade: patch.grade ?? null } : {}),
      ...touch,
    })
    .where(and(eq(coursePlanEntries.id, id), eq(coursePlanEntries.studentId, s.userId)));
  revalidatePath("/planner");
}

export async function removeCourseAction(id: string) {
  const s = await requireStudent();
  await db
    .delete(coursePlanEntries)
    .where(and(eq(coursePlanEntries.id, id), eq(coursePlanEntries.studentId, s.userId)));
  revalidatePath("/planner");
}

/* ————————————— Activities ————————————— */

export async function addActivityAction(a: Activity) {
  const s = await requireStudent();
  const [row] = await db
    .insert(activities)
    .values({
      studentId: s.userId,
      name: a.name,
      role: a.role,
      hoursPerWeek: a.hoursPerWeek,
      weeksPerYear: a.weeksPerYear,
      description: a.description,
      yearsInvolved: a.yearsInvolved,
      leadership: a.leadership,
    })
    .returning({ id: activities.id });
  revalidatePath("/planner");
  return row.id;
}

export async function updateActivityAction(id: string, patch: Partial<Activity>) {
  const s = await requireStudent();
  await db
    .update(activities)
    .set({
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.role !== undefined ? { role: patch.role } : {}),
      ...(patch.hoursPerWeek !== undefined ? { hoursPerWeek: patch.hoursPerWeek } : {}),
      ...(patch.weeksPerYear !== undefined ? { weeksPerYear: patch.weeksPerYear } : {}),
      ...(patch.description !== undefined ? { description: patch.description } : {}),
      ...(patch.yearsInvolved !== undefined ? { yearsInvolved: patch.yearsInvolved } : {}),
      ...(patch.leadership !== undefined ? { leadership: patch.leadership } : {}),
      ...touch,
    })
    .where(and(eq(activities.id, id), eq(activities.studentId, s.userId)));
  revalidatePath("/planner");
}

export async function removeActivityAction(id: string) {
  const s = await requireStudent();
  await db.delete(activities).where(and(eq(activities.id, id), eq(activities.studentId, s.userId)));
  revalidatePath("/planner");
}

/* ————————————— Check-ins ————————————— */

export async function dismissCheckInAction(id: string) {
  const s = await requireStudent();
  await db
    .update(weeklyCheckIns)
    .set({ dismissed: true, ...touch })
    .where(and(eq(weeklyCheckIns.id, id), eq(weeklyCheckIns.studentId, s.userId)));
  revalidatePath("/dashboard");
}

/** Actions have real ids now; the index is resolved against sortOrder. */
export async function toggleCheckInActionAction(checkInId: string, index: number) {
  const s = await requireStudent();
  const [owned] = await db
    .select({ id: weeklyCheckIns.id })
    .from(weeklyCheckIns)
    .where(and(eq(weeklyCheckIns.id, checkInId), eq(weeklyCheckIns.studentId, s.userId)))
    .limit(1);
  if (!owned) return;

  const rows = await db
    .select()
    .from(checkInActions)
    .where(eq(checkInActions.checkInId, checkInId))
    .orderBy(checkInActions.sortOrder);
  const target = rows[index];
  if (!target) return;

  await db
    .update(checkInActions)
    .set({ done: !target.done, ...touch })
    .where(eq(checkInActions.id, target.id));
  revalidatePath("/dashboard");
}

/* ————————————— Misc ————————————— */

export async function markViewedAction(schoolId: string) {
  const viewer = await requireViewer();
  await db
    .insert(recentlyViewed)
    .values({ userId: viewer.userId, schoolId, viewedAt: new Date() })
    .onConflictDoUpdate({
      target: [recentlyViewed.userId, recentlyViewed.schoolId],
      set: { viewedAt: new Date() },
    });
}

export async function updateStudentProfileAction(patch: Record<string, unknown>) {
  const s = await requireStudent();
  await db
    .update(studentProfiles)
    .set({ ...patch, ...touch })
    .where(eq(studentProfiles.userId, s.userId));
  revalidatePath("/dashboard");
}
