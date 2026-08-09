/* ————————————————————————————————————————
   Counselor server actions.

   The pages used to call `counselor.*` directly from the browser, passing
   the whole Profile in the request. That was fine against a mock and is not
   fine against a real model: the profile has to come from the session, or a
   parent could forge a student-scoped completion.

   Everything here runs on the server. The client sends a message and a
   thread id; nothing else is trusted.
   ———————————————————————————————————————— */

"use server";

import { and, asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  counselorMessages,
  counselorThreads,
  schoolExplanations,
  schools,
} from "@/lib/db/schema";
import { requireStudent, requireViewer } from "@/lib/auth/policy";
import { loadSnapshot } from "@/lib/db/queries/snapshot";
import { createClaudeCounselor } from "@/lib/counselor/claude";
import type { CounselorCard, CounselorMessage, EssayFeedback, InterviewFeedback } from "@/lib/counselor";
import type { School, StudentProfile } from "@/lib/types";
import { getSchool } from "@/lib/data/schools";

let knownIds: Set<string> | null = null;
async function knownSchoolIds(): Promise<Set<string>> {
  if (!knownIds) {
    const rows = await db.select({ id: schools.id }).from(schools);
    knownIds = new Set(rows.map((r) => r.id));
  }
  return knownIds;
}

/**
 * A per-request service instance. Every call is metered against the caller,
 * so the factory needs the viewer's id — which is why this is built per
 * request rather than once at module scope.
 */
function serviceFor(userId: string) {
  return createClaudeCounselor({ knownSchoolIds, userId });
}

/** The viewer's profile, read from the session — never from the client. */
async function sessionProfile() {
  const viewer = await requireViewer();
  const snap = await loadSnapshot(viewer);
  if (!snap.profile) throw new Error("Finish onboarding first.");
  return { viewer, profile: snap.profile };
}

/* ————————————— Threads ————————————— */

export async function createThreadAction(title?: string) {
  const s = await requireStudent();
  const [row] = await db
    .insert(counselorThreads)
    .values({ studentId: s.userId, title: title ?? "New conversation" })
    .returning({ id: counselorThreads.id });
  return row.id;
}

export async function listThreadsAction() {
  const s = await requireStudent();
  const threads = await db
    .select()
    .from(counselorThreads)
    .where(eq(counselorThreads.studentId, s.userId))
    .orderBy(asc(counselorThreads.createdAt));

  const out = [];
  for (const t of threads) {
    const msgs = await db
      .select()
      .from(counselorMessages)
      .where(eq(counselorMessages.threadId, t.id))
      .orderBy(asc(counselorMessages.createdAt));
    out.push({
      id: t.id,
      title: t.title,
      messages: msgs.map(toMessage),
    });
  }
  return out;
}

function toMessage(m: typeof counselorMessages.$inferSelect): CounselorMessage {
  return {
    id: m.id,
    author: m.author,
    text: m.text,
    cards: (m.cards as CounselorCard[] | null) ?? undefined,
    createdAt: m.createdAt.toISOString(),
  };
}

async function persist(threadId: string, msg: CounselorMessage) {
  await db.insert(counselorMessages).values({
    threadId,
    author: msg.author,
    text: msg.text,
    cards: msg.cards ?? null,
  });
  await db
    .update(counselorThreads)
    .set({ updatedAt: new Date() })
    .where(eq(counselorThreads.id, threadId));
}

/* ————————————— Chat ————————————— */

export async function greetAction(threadId: string): Promise<CounselorMessage> {
  const { viewer, profile } = await sessionProfile();
  const msg = await serviceFor(viewer.userId).greet(profile);
  await persist(threadId, msg);
  return msg;
}

export async function chatAction(input: {
  threadId: string;
  message: string;
  context?: { schoolId?: string; screen?: string };
}): Promise<CounselorMessage> {
  const s = await requireStudent();
  const { profile } = await sessionProfile();

  // Ownership check — threadId comes from the client, so it's an IDOR
  // vector unless verified.
  const [thread] = await db
    .select({ id: counselorThreads.id })
    .from(counselorThreads)
    .where(and(eq(counselorThreads.id, input.threadId), eq(counselorThreads.studentId, s.userId)))
    .limit(1);
  if (!thread) throw new Error("That conversation doesn't exist.");

  const history = await db
    .select()
    .from(counselorMessages)
    .where(eq(counselorMessages.threadId, input.threadId))
    .orderBy(asc(counselorMessages.createdAt));

  await persist(input.threadId, {
    id: crypto.randomUUID(),
    author: "user",
    text: input.message,
    createdAt: new Date().toISOString(),
  });

  const res = await serviceFor(s.userId).chat({
    profile,
    threadId: input.threadId,
    message: input.message,
    context: input.context,
    history: history.map(toMessage),
  });

  await persist(input.threadId, res.message);

  // Title the thread from the first real exchange.
  if (history.length === 0) {
    await db
      .update(counselorThreads)
      .set({ title: input.message.slice(0, 40) })
      .where(eq(counselorThreads.id, input.threadId));
  }

  return res.message;
}

/* ————————————— Per-school explanation, cached ————————————— */

/**
 * whyThisSchool fired on every school-detail page view with no caching, so a
 * student browsing 40 schools triggered 40 completions. Cached per
 * (student, school); invalidated by bumping profileHash when the profile
 * changes, since the explanation is profile-specific.
 */
export async function whyThisSchoolAction(schoolId: string): Promise<string> {
  const { viewer, profile } = await sessionProfile();
  if (profile.role !== "student") return "";

  const school = getSchool(schoolId);
  if (!school) return "";

  const hash = profileHash(profile);

  const [cached] = await db
    .select()
    .from(schoolExplanations)
    .where(
      and(
        eq(schoolExplanations.studentId, viewer.userId),
        eq(schoolExplanations.schoolId, schoolId),
      ),
    )
    .limit(1);

  if (cached && cached.profileHash === hash) return cached.text;

  const text = await serviceFor(viewer.userId).whyThisSchool(profile, school as School);

  await db
    .insert(schoolExplanations)
    .values({ studentId: viewer.userId, schoolId, text, profileHash: hash })
    .onConflictDoUpdate({
      target: [schoolExplanations.studentId, schoolExplanations.schoolId],
      set: { text, profileHash: hash, updatedAt: new Date() },
    });

  return text;
}

/** Only the fields the explanation actually depends on. */
function profileHash(p: StudentProfile | { role: "parent" }): string {
  if (p.role !== "student") return "parent";
  const s = p as StudentProfile;
  return JSON.stringify([
    s.gradeLevel,
    s.gpa.unweighted,
    s.gpa.weighted,
    s.rigor,
    s.testScores.sat,
    s.testScores.act,
    s.intendedMajors,
    s.undecided,
    s.geography.regions,
    s.campus,
    s.budget.maxPerYear,
    s.values,
  ]);
}

/* ————————————— Essays & interviews ————————————— */

export async function essayFeedbackAction(input: {
  promptText: string;
  essayText: string;
}): Promise<EssayFeedback> {
  const { viewer, profile } = await sessionProfile();
  if (profile.role !== "student") {
    return { observations: [], questions: [] };
  }
  return serviceFor(viewer.userId).essayFeedback(profile as StudentProfile, input.promptText, input.essayText);
}

export async function interviewTurnAction(input: {
  schoolId: string | null;
  question: string;
  answer: string;
}): Promise<InterviewFeedback & { nextQuestion?: string }> {
  const { viewer, profile } = await sessionProfile();
  if (profile.role !== "student") {
    return { strengths: [], toWorkOn: [], followUp: "" };
  }
  const school = input.schoolId ? ((getSchool(input.schoolId) ?? null) as School | null) : null;
  return serviceFor(viewer.userId).interviewTurn(profile as StudentProfile, school, input.question, input.answer);
}

export async function summarizeProfileAction(): Promise<string> {
  const { viewer, profile } = await sessionProfile();
  return serviceFor(viewer.userId).summarizeProfile(profile);
}
