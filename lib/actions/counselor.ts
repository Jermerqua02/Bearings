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

import { revalidatePath } from "next/cache";
import { and, asc, count, desc, eq, isNotNull, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  counselorMessages,
  counselorThreads,
  coursePlanEntries,
  interviewSessions,
  interviewTurns,
  listEntries,
  schoolExplanations,
  schools,
  studentProfiles,
  transcripts,
} from "@/lib/db/schema";
import { AuthzError, requireStudent, requireViewer } from "@/lib/auth/policy";
import { loadSnapshot } from "@/lib/db/queries/snapshot";
import { addMemories, rawMemories, updateMemory } from "@/lib/db/queries/memory";
import { checkRateLimit } from "@/lib/rate-limit";
import { assertFeature, isPro, proStatus } from "@/lib/entitlements";
import { UserFacingError } from "@/lib/actions/_error";
import { createClaudeCounselor } from "@/lib/counselor/claude";
import { localTitle } from "@/lib/counselor";
import type {
  ChatEvents,
  CounselorCard,
  CounselorMessage,
  EssayFeedback,
  InterviewExchange,
  InterviewFeedback,
} from "@/lib/counselor";
import { courseworkSummary } from "@/lib/coursework";
import type { GradeLevel, Profile, School, StudentProfile } from "@/lib/types";
import { getSchoolById, getSchoolMap } from "@/lib/db/queries/schools";
import { residencyAt, residencyNote } from "@/lib/residency";

/**
 * Ids the model is allowed to reference, cached briefly.
 *
 * This was cached for the life of the process and never invalidated. That
 * was survivable when the table held forty hand-written rows and never
 * changed; with an importer that adds ~1,900 it means a server started
 * before an import prunes *valid* school cards out of counselor answers
 * forever, which shows up as a silent blank card — exactly the failure the
 * pruning exists to prevent.
 */
let knownIds: Set<string> | null = null;
let knownIdsAt = 0;
const KNOWN_IDS_TTL_MS = 10 * 60 * 1000;

async function knownSchoolIds(): Promise<Set<string>> {
  const now = Date.now();
  if (!knownIds || now - knownIdsAt > KNOWN_IDS_TTL_MS) {
    const rows = await db.select({ id: schools.id }).from(schools);
    knownIds = new Set(rows.map((r) => r.id));
    knownIdsAt = now;
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

/**
 * Every AI call passes through here, so the spend guard goes here too —
 * one place rather than eight call sites, none of which can be forgotten.
 *
 * Throws rather than returning a result, because the callers return domain
 * shapes (a message, a feedback object) with nowhere sensible to put "you
 * are going too fast". The thrown message is written to be shown.
 */
async function guardedServiceFor(userId: string, feature: string) {
  const rate = await checkRateLimit(userId, feature);
  if (!rate.allowed) {
    const minutes = Math.ceil(rate.retryAfterSeconds / 60);
    // UserFacingError: this sentence is for the student, and safeError()
    // would otherwise replace it with "something went wrong".
    throw new UserFacingError(
      `You've reached the limit for this feature (${rate.limit} an hour). Try again in about ${minutes} minute${minutes === 1 ? "" : "s"}.`,
    );
  }
  // Free gets the counselor once, as a sample; the rest is Pro. One check,
  // here, because every AI call already comes through.
  await assertFeature(userId, feature);
  return serviceFor(userId);
}

/**
 * The viewer's profile, read from the session — never from the client —
 * with what they've told the counselor before attached, so every model
 * call (chat, greeting, why-this-school, interviews) knows it.
 */
async function sessionProfile() {
  const viewer = await requireViewer();
  const snap = await loadSnapshot(viewer);
  if (!snap.profile) throw new UserFacingError("Finish onboarding first.");
  const profile = snap.profile;
  // Students and parents each have their own counselor, and their own notes.
  const notes = await rawMemories(viewer.userId).catch(() => []);
  profile.counselorNotes = notes.map((n) => ({ category: n.category, fact: n.fact }));
  // A parent's counselor knows their student by name (and nothing private).
  if (profile.role === "parent" && snap.subjectStudentId) {
    const [row] = await db
      .select({ firstName: studentProfiles.firstName })
      .from(studentProfiles)
      .where(eq(studentProfiles.userId, snap.subjectStudentId))
      .limit(1);
    profile.studentFirstName = row?.firstName;
  }
  return { viewer, profile, studentId: snap.subjectStudentId };
}

/**
 * Learn from a turn: file anything durable the student (or parent) said
 * about themselves. Runs after the reply is saved and never blocks or
 * fails it — they're already reading the answer.
 */
async function rememberFromTurn(
  userId: string,
  role: "student" | "parent",
  threadId: string,
  studentMessage: string,
  counselorReply: string,
) {
  try {
    // The counselor's memory is Pro: a Free sample conversation isn't filed.
    if (!isPro(await proStatus(userId))) return;
    const known = (await rawMemories(userId)).map((m) => ({ id: m.id, category: m.category, fact: m.fact }));
    const changes = await serviceFor(userId).extractMemories({ studentMessage, counselorReply, known, role });
    if (changes.add.length) await addMemories(userId, changes.add, "chat", threadId);
    for (const u of changes.update) await updateMemory(userId, u.id, { fact: u.fact });
  } catch (err) {
    console.error("[memory] could not learn from turn:", err);
  }
}

/* ————————————— Threads —————————————

   Anyone's own conversations: a student's with their counselor, a
   parent's with theirs. Every query is scoped to the caller's id, so
   neither can reach the other's. */

export async function createThreadAction(title?: string, schoolId?: string) {
  const s = await requireViewer();
  // An id that names no school is dropped rather than failing the thread.
  const school = schoolId ? await getSchoolById(schoolId) : null;
  const [row] = await db
    .insert(counselorThreads)
    .values({ studentId: s.userId, title: title ?? "New conversation", schoolId: school?.id ?? null })
    .returning({ id: counselorThreads.id });
  return row.id;
}

export async function listThreadsAction() {
  const s = await requireViewer();
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
      schoolId: t.schoolId ?? undefined,
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

/**
 * The student's list, rendered for the model.
 *
 * Without this the counselor cannot answer "is my list realistic" — a live
 * run replied "I don't have your school list yet", which is the single most
 * likely first question. Names and tiers only; no notes, nothing private.
 */
async function listSummaryFor(
  studentId: string,
  homeState?: string,
  heading = "The student's current list",
  empty = "The student has not added any schools to their list yet.",
): Promise<string> {
  const rows = await db
    .select({
      schoolId: listEntries.schoolId,
      tier: listEntries.tier,
      plan: listEntries.plan,
      status: listEntries.status,
      outcome: listEntries.outcome,
    })
    .from(listEntries)
    .where(eq(listEntries.studentId, studentId));

  if (rows.length === 0) return empty;

  // One query for the whole list rather than one per row.
  const byId = await getSchoolMap(rows.map((r) => r.schoolId));

  const lines = rows.map((r) => {
    const school = byId.get(r.schoolId);
    const name = school?.name ?? r.schoolId;
    const bits = [r.tier, r.plan, r.status, r.outcome].filter(Boolean).join(", ");
    // In-state, out-of-state, or an exchange like WUE — the counselor
    // otherwise has to guess, and hedges ("if you're a California resident").
    const where = school ? ` ${residencyNote(school, residencyAt(school, homeState), homeState)}` : "";
    return `- ${name} (id: ${r.schoolId}) — ${bits}.${where}`;
  });

  return `${heading} (${rows.length} schools):\n${lines.join("\n")}`;
}

/**
 * Both lists a parent's counselor should know: their student's (the one
 * that gets applied from) and the parent's own, kept apart so "my list"
 * and "her list" stay what they mean.
 */
async function parentListSummary(
  parentId: string,
  studentId: string | null,
  profile: Extract<Profile, { role: "parent" }>,
): Promise<string> {
  const name = profile.studentFirstName ?? "their student";
  const [theirs, own] = await Promise.all([
    studentId
      ? listSummaryFor(studentId, profile.homeState, `${name}'s list — the one ${name} applies from`, `${name} hasn't added any schools to their list yet.`)
      : Promise.resolve(""),
    listSummaryFor(parentId, profile.homeState, "The parent's own list — schools they're looking at themselves", "The parent hasn't saved any schools of their own yet."),
  ]);
  return [theirs, own].filter(Boolean).join("\n\n");
}

/**
 * The student's coursework, rendered for the model.
 *
 * The counselor knew a self-reported GPA and three rigor counts from
 * onboarding, and nothing else about what the student had actually studied.
 * That is thin ground for "is this school a reach" and useless for "what
 * should I take next year" — both of which are answerable off the course
 * plan the transcript now fills in.
 */
async function courseworkSummaryFor(studentId: string): Promise<string> {
  const rows = await db
    .select()
    .from(coursePlanEntries)
    .where(eq(coursePlanEntries.studentId, studentId))
    .orderBy(asc(coursePlanEntries.year));

  // The most recent transcript that actually printed a GPA. That figure is
  // authoritative over anything computed from the rows.
  const [reported] = await db
    .select({
      unweighted: transcripts.reportedGpa,
      weighted: transcripts.reportedGpaWeighted,
    })
    .from(transcripts)
    .where(and(eq(transcripts.studentId, studentId), isNotNull(transcripts.reportedGpa)))
    .orderBy(desc(transcripts.createdAt))
    .limit(1);

  return courseworkSummary(
    rows.map((c) => ({
      id: c.id,
      year: c.year as GradeLevel,
      subject: c.subject,
      name: c.name,
      level: c.level,
      status: c.status,
      grade: c.grade ?? undefined,
      term: c.term ?? undefined,
      credits: c.credits ?? undefined,
    })),
    reported ?? null,
  );
}

/* ————————————— Chat ————————————— */

export async function greetAction(threadId: string): Promise<CounselorMessage> {
  const { viewer, profile } = await sessionProfile();
  // The thread id comes from the client: only greet into your own.
  const [own] = await db
    .select({ id: counselorThreads.id })
    .from(counselorThreads)
    .where(and(eq(counselorThreads.id, threadId), eq(counselorThreads.studentId, viewer.userId)))
    .limit(1);
  if (!own) throw new AuthzError("That conversation doesn't exist.");
  const msg = await (await guardedServiceFor(viewer.userId, "greet")).greet(profile);
  await persist(threadId, msg);
  return msg;
}

export async function chatAction(input: {
  threadId: string;
  message: string;
  context?: { schoolId?: string; screen?: string };
  /*
    Returns the thread's new title alongside the reply when this was the
    first message. The client titles the thread optimistically so the
    sidebar updates the instant you press send; without handing the real
    one back, that placeholder is what stays on screen and the generated
    title is only ever seen after a reload.
  */
}, events?: ChatEvents & {
  /*
    The finished reply, as soon as it's saved — before the thread is named,
    which is another model call. A streaming client shows the answer here
    and the title when the action returns.
  */
  onReply?(message: CounselorMessage): void;
}): Promise<{ message: CounselorMessage; title?: string }> {
  const s = await requireViewer();
  const { profile, studentId } = await sessionProfile();

  // Ownership check — threadId comes from the client, so it's an IDOR
  // vector unless verified.
  const [thread] = await db
    .select({ id: counselorThreads.id, schoolId: counselorThreads.schoolId })
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

  // The thread's own school wins; the client's is for threads made before
  // threads remembered one.
  const schoolId = thread.schoolId ?? input.context?.schoolId;
  // A parent's counselor sees the student's list (which the parent can see
  // anyway) and the parent's own — never the student's coursework.
  const parent = profile.role === "parent";
  const [service, listSummary, coursework, school] = await Promise.all([
    guardedServiceFor(s.userId, "chat"),
    parent ? parentListSummary(s.userId, studentId, profile) : listSummaryFor(s.userId, profile.homeState),
    parent ? Promise.resolve("") : courseworkSummaryFor(s.userId),
    schoolId ? getSchoolById(schoolId) : null,
  ]);
  const res = await service.chat(
    {
      profile,
      threadId: input.threadId,
      message: input.message,
      context: {
        ...input.context,
        // A conversation started from a school's page is about that school;
        // without it the counselor answered "what are my chances?" in general.
        school: school ?? undefined,
        listSummary,
        courseworkSummary: coursework,
      },
      history: history.map(toMessage),
    },
    events,
  );

  await persist(input.threadId, res.message);
  events?.onReply?.(res.message);
  void rememberFromTurn(s.userId, parent ? "parent" : "student", input.threadId, input.message, res.message.text);

  /*
    Name the thread from the first real exchange.

    The condition used to be `history.length === 0`, which never held: a new
    thread is greeted immediately, so by the student's first message the
    history already had one row. Every conversation stayed "New conversation"
    and a student's sidebar was seven identical lines.

    Counting the student's own messages is the thing actually meant — the
    greeting is ours, and says nothing about what the conversation is for.
  */
  const isFirstFromStudent = history.every((m) => m.author !== "user");
  if (isFirstFromStudent) {
    const title = await (async () => {
      try {
        return await (await serviceFor(s.userId)).titleFor(input.message, res.message.text);
      } catch {
        // A failed title must never fail the reply the student is waiting for.
        return localTitle(input.message);
      }
    })();
    await db
      .update(counselorThreads)
      .set({ title, updatedAt: new Date() })
      .where(eq(counselorThreads.id, input.threadId));
    return { message: res.message, title };
  }

  return { message: res.message };
}

/**
 * Delete a conversation and everything in it.
 *
 * Scoped by `studentId` in the same statement, not checked separately: the
 * thread id comes from the client, so a delete that only matched on id would
 * let anyone remove anyone's conversation.
 */
export async function deleteThreadAction(threadId: string) {
  const s = await requireViewer();
  const [row] = await db
    .delete(counselorThreads)
    .where(and(eq(counselorThreads.id, threadId), eq(counselorThreads.studentId, s.userId)))
    .returning({ id: counselorThreads.id });
  if (!row) throw new AuthzError("That conversation doesn't exist.");
  revalidatePath("/counselor");
}

/** Let them fix a title we got wrong. */
export async function renameThreadAction(threadId: string, title: string) {
  const s = await requireViewer();
  const clean = title.replace(/\s+/g, " ").trim().slice(0, 60);
  if (!clean) return;
  await db
    .update(counselorThreads)
    .set({ title: clean, updatedAt: new Date() })
    .where(and(eq(counselorThreads.id, threadId), eq(counselorThreads.studentId, s.userId)));
  revalidatePath("/counselor");
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

  const school = await getSchoolById(schoolId);
  if (!school) return "";

  // The suffix is the prompt's version: a cached explanation written for
  // the old "why might it fit" prompt is regenerated, not reused.
  const hash = `${profileHash(profile)}:fit-v2`;

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

  const text = await (await guardedServiceFor(viewer.userId, "why_school")).whyThisSchool(profile, school as School);

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
    // In-state or not changes "is this affordable" at every public school.
    s.homeState ?? null,
    // A remembered fact can change the answer ("needs to stay near home").
    s.counselorNotes ?? [],
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
  const svc = await guardedServiceFor(viewer.userId, "essay_feedback");
  return svc.essayFeedback(profile as StudentProfile, input.promptText, input.essayText);
}

/** How many earlier exchanges of a session the next turn gets to see. */
const INTERVIEW_CONTEXT_TURNS = 6;

export async function interviewTurnAction(input: {
  schoolId: string | null;
  question: string;
  answer: string;
  /** This sitting's earlier exchanges, oldest first. Context only; not stored again. */
  earlier?: InterviewExchange[];
}): Promise<InterviewFeedback> {
  const { viewer, profile } = await sessionProfile();
  if (profile.role !== "student") {
    return { strengths: [], toWorkOn: [], followUp: "" };
  }
  const school = input.schoolId ? await getSchoolById(input.schoolId) : null;
  const svc = await guardedServiceFor(viewer.userId, "interview");
  const feedback = await svc.interviewTurn(
    profile as StudentProfile,
    school,
    input.question,
    input.answer,
    // Bounded here as well as at the route: the prompt is what costs money.
    (input.earlier ?? []).slice(-INTERVIEW_CONTEXT_TURNS),
  );

  /*
    Keep the practice.

    interview_session and interview_turn have existed since the schema was
    written, with a read query in lib/db/queries/student.ts, and nothing ever
    wrote a row: the turns lived in useState and were gone on reload. A
    student rehearsing for an interview loses the answer they worked on and
    the critique of it, which is the whole artefact.

    One session per school (and one for general practice), so returning to a
    school continues where they left off rather than starting over.
  */
  const [session] = await db
    .select({ id: interviewSessions.id })
    .from(interviewSessions)
    .where(
      and(
        eq(interviewSessions.studentId, viewer.userId),
        input.schoolId
          ? eq(interviewSessions.schoolId, input.schoolId)
          : isNull(interviewSessions.schoolId),
      ),
    )
    .limit(1);

  const sessionId =
    session?.id ??
    (
      await db
        .insert(interviewSessions)
        .values({ studentId: viewer.userId, schoolId: input.schoolId })
        .returning({ id: interviewSessions.id })
    )[0].id;

  const [{ n }] = await db
    .select({ n: count() })
    .from(interviewTurns)
    .where(eq(interviewTurns.sessionId, sessionId));

  await db.insert(interviewTurns).values({
    sessionId,
    question: input.question,
    answer: input.answer,
    strengths: feedback.strengths,
    toWorkOn: feedback.toWorkOn,
    followUp: feedback.followUp,
    nextQuestion: feedback.nextQuestion ?? null,
    sortOrder: n,
  });

  return feedback;
}

export async function summarizeProfileAction(): Promise<string> {
  const { viewer, profile } = await sessionProfile();
  const svc = await guardedServiceFor(viewer.userId, "summarize");
  return svc.summarizeProfile(profile);
}

/**
 * Practice history for a school (or for general practice).
 *
 * The turns were being written and never read back, which looks identical to
 * not saving them: a student returned to the page and their answers and
 * critiques were gone.
 */
export async function interviewHistoryAction(
  schoolId: string | null,
): Promise<{ question: string; answer: string; feedback: InterviewFeedback }[]> {
  const s = await requireStudent();
  const [session] = await db
    .select({ id: interviewSessions.id })
    .from(interviewSessions)
    .where(
      and(
        eq(interviewSessions.studentId, s.userId),
        schoolId ? eq(interviewSessions.schoolId, schoolId) : isNull(interviewSessions.schoolId),
      ),
    )
    .limit(1);
  if (!session) return [];

  const rows = await db
    .select()
    .from(interviewTurns)
    .where(eq(interviewTurns.sessionId, session.id))
    .orderBy(asc(interviewTurns.sortOrder));

  return rows.map((r) => ({
    question: r.question,
    answer: r.answer,
    feedback: {
      strengths: r.strengths,
      toWorkOn: r.toWorkOn,
      followUp: r.followUp,
      ...(r.nextQuestion ? { nextQuestion: r.nextQuestion } : {}),
    },
  }));
}
