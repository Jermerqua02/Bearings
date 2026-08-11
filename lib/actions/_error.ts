/* ————————————————————————————————————————
   Turning a thrown value into something safe to send to a browser.

   A server action that returns `err.message` hands the client whatever the
   throwing layer happened to say. For Postgres via Drizzle that is the
   entire failed statement plus every bound parameter — schema, column
   names, and the user's own answers, rendered on screen. That is exactly
   what onboarding did: a non-numeric GPA produced a NaN insert, and the
   student got the full `INSERT INTO student_profile …` dumped under the
   question.

   The rule here is that the caller decides what the user reads. The
   original error goes to the server log, tagged, where it is actually
   useful. Nothing else crosses the boundary.

   AuthzError is the deliberate exception — those messages ("Students
   only", "Not signed in") are authored for display and carry no internals.
   ———————————————————————————————————————— */

import "server-only";

import { AuthzError } from "@/lib/auth/policy";

/**
 * Log `err` server-side and return the message the user should see.
 *
 * @param tag    Log prefix identifying the call site, e.g. "onboarding".
 * @param err    The thrown value, logged in full and never returned.
 * @param userMessage  What the user reads. Written by the caller, because
 *                     only the caller knows what the user was trying to do.
 */
export function safeError(tag: string, err: unknown, userMessage: string): string {
  console.error(`[${tag}]`, err);

  // Authored for display, and already free of internals.
  if (err instanceof AuthzError) return err.message;

  return userMessage;
}
