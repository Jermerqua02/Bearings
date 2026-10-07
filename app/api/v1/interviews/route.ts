/* ————————————————————————————————————————
   GET  /api/v1/interviews?schoolId=   — questions, schools, saved practice
   POST /api/v1/interviews { schoolId?, question, answer } — feedback

   Practice is kept per school (and one session for general practice), so
   coming back continues where the student left off.
   ———————————————————————————————————————— */

import { interviewHistoryAction, interviewTurnAction } from "@/lib/actions/counselor";
import { requireStudent } from "@/lib/auth/policy";
import { loadSnapshot } from "@/lib/db/queries/snapshot";
import { BadRequest, body, route, str } from "@/lib/api/v1";
import type { School } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

/* Same list and the same rule as app/(app)/interviews/page.tsx. */
const COMMON_QUESTIONS = [
  "Tell me about yourself.",
  "Why are you interested in this school?",
  "What do you do outside of class — and why that?",
  "Tell me about a challenge you worked through.",
  "What would you add to our campus community?",
  "What are you reading, watching, or making right now?",
];

function offersInterview(s: School): boolean {
  const rate = s.admissions.acceptanceRate;
  return s.type !== "public" && s.type !== "public-flagship" && rate !== undefined && rate < 0.6;
}

export const GET = route("interviews", "We couldn't load your practice.", async (request) => {
  const viewer = await requireStudent();
  const schoolId = new URL(request.url).searchParams.get("schoolId") || null;
  const snap = await loadSnapshot(viewer);
  const listed = new Set(snap.list.map((e) => e.schoolId));
  return {
    questions: COMMON_QUESTIONS,
    schools: snap.schools
      .filter((s) => listed.has(s.id) && offersInterview(s))
      .map((s) => ({ id: s.id, name: s.name })),
    turns: await interviewHistoryAction(schoolId),
  };
});

export const POST = route(
  "interviews:turn",
  "The counselor couldn't give feedback just now. Try again in a moment.",
  async (request) => {
    await requireStudent();
    const b = await body(request);
    const answer = str(b.answer, "answer", 8_000).trim();
    if (!answer) throw new BadRequest("Answer the question first.");
    return interviewTurnAction({
      schoolId: typeof b.schoolId === "string" && b.schoolId ? b.schoolId : null,
      question: str(b.question, "question", 500),
      answer,
    });
  },
);
