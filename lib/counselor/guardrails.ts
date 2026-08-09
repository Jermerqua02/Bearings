/* ————————————————————————————————————————
   "The AI never writes a student's essay."

   The README lists this as a product rule and the UI states it to the
   student. Until now it was enforced only by the shape of EssayFeedback —
   which has no field capable of holding a rewrite — plus a comment on the
   interface.

   That stops a *field* for the rewrite. It does not stop a rewrite smuggled
   into an observation note, which is exactly what a helpful model will do
   unprompted. This module is the runtime half.
   ———————————————————————————————————————— */

import type { EssayFeedback } from "@/lib/counselor";

/** Phrases that introduce prose written *for* the student. */
const REWRITE_TELLS = [
  /\btry (?:something like|writing|rewriting|this)\b/i,
  /\b(?:here'?s|here is) (?:a|an|the) (?:rewrite|revision|rewritten|stronger|better) version\b/i,
  /\bfor example,? you could write\b/i,
  /\byou (?:could|might) (?:say|write|open with|start with)[:,]\s*["“]/i,
  /\bconsider (?:opening|starting) with[:,]\s*["“]/i,
  /\brevised[:,]\s*["“]/i,
  /\binstead,? write\b/i,
];

/** Longest run of words shared between two texts. */
function longestSharedRun(a: string, b: string): number {
  const norm = (s: string) =>
    s.toLowerCase().replace(/[^\w\s]/g, " ").split(/\s+/).filter(Boolean);
  const A = norm(a);
  const B = norm(b);
  if (A.length === 0 || B.length === 0) return 0;

  // Rolling comparison; the texts here are short enough that O(n·m) is fine.
  let best = 0;
  let prev = new Array<number>(B.length + 1).fill(0);
  for (let i = 1; i <= A.length; i++) {
    const curr = new Array<number>(B.length + 1).fill(0);
    for (let j = 1; j <= B.length; j++) {
      if (A[i - 1] === B[j - 1]) {
        curr[j] = prev[j - 1] + 1;
        if (curr[j] > best) best = curr[j];
      }
    }
    prev = curr;
  }
  return best;
}

export interface GuardResult {
  feedback: EssayFeedback;
  violations: string[];
}

/**
 * Strip anything that reads as ghostwriting.
 *
 * Two signals:
 *  - a rewrite tell ("here's a stronger version:", `you could write: "…"`)
 *  - a long verbatim run against the student's own draft, which means the
 *    model is handing back polished prose rather than an observation
 *
 * Offending notes are dropped rather than rewritten. Losing a note is a
 * smaller failure than shipping a rewrite the UI promised wouldn't happen.
 */
export function enforceNeverWrites(
  feedback: EssayFeedback,
  essayText: string,
  { maxSharedRun = 12 }: { maxSharedRun?: number } = {},
): GuardResult {
  const violations: string[] = [];

  const observations = feedback.observations.filter((o) => {
    const tell = REWRITE_TELLS.find((r) => r.test(o.note));
    if (tell) {
      violations.push(`dropped ${o.area} note: rewrite phrasing (${tell.source.slice(0, 30)}…)`);
      return false;
    }
    // A quoted span is fine when it's short — quoting the student back to
    // themselves is legitimate critique. A long one is ghostwriting.
    const run = longestSharedRun(o.note, essayText);
    if (run > maxSharedRun) {
      violations.push(`dropped ${o.area} note: ${run}-word verbatim run from the draft`);
      return false;
    }
    return true;
  });

  const questions = feedback.questions.filter((q) => {
    if (REWRITE_TELLS.some((r) => r.test(q))) {
      violations.push("dropped question: rewrite phrasing");
      return false;
    }
    // A "question" that isn't asking anything is usually a suggestion in
    // disguise.
    if (!q.includes("?")) {
      violations.push("dropped question: not actually a question");
      return false;
    }
    return true;
  });

  return { feedback: { observations, questions }, violations };
}
