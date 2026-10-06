/* ————————————————————————————————————————
   POST /api/v1/counselor/threads/:id/greet

   The counselor's opening line for a new thread. Answers the message.
   ———————————————————————————————————————— */

import { greetAction } from "@/lib/actions/counselor";
import { route } from "@/lib/api/v1";
import { requireOwnThread } from "@/lib/api/threads";

export const runtime = "nodejs";
export const maxDuration = 60;

export const POST = route<{ id: string }>(
  "threads:greet",
  "The counselor couldn't start this conversation. Try again in a moment.",
  async (_r, { id }) => greetAction(await requireOwnThread(id)),
);
