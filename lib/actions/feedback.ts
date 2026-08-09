/* Submitting feedback.

   Separate from lib/actions/admin.ts because this one is for everybody —
   any signed-in user can file a report, and only an admin can act on it. */

"use server";

import { db } from "@/lib/db";
import { feedback } from "@/lib/db/schema";
import { requireViewer } from "@/lib/auth/policy";

export type FeedbackResult = { ok: true } | { ok: false; error: string };

const MAX_LENGTH = 4000;

export async function submitFeedback(input: {
  message: string;
  path: string;
}): Promise<FeedbackResult> {
  try {
    const viewer = await requireViewer();

    const message = input.message.trim();
    if (!message) return { ok: false, error: "Write something first." };
    if (message.length > MAX_LENGTH) {
      return { ok: false, error: `Keep it under ${MAX_LENGTH} characters.` };
    }

    await db.insert(feedback).values({
      userId: viewer.userId,
      // Denormalized so the report survives the account being deleted.
      email: viewer.email,
      message,
      path: input.path.slice(0, 200),
    });

    return { ok: true };
  } catch (err) {
    console.error("[feedback] submit failed:", err);
    return { ok: false, error: "Couldn't send that. Try again in a moment." };
  }
}
