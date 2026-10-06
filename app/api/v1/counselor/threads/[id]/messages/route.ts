/* ————————————————————————————————————————
   POST /api/v1/counselor/threads/:id/messages  { message, context? }

   Answers { message, title? } — title only on the student's first message,
   when the thread is named from the exchange.
   ———————————————————————————————————————— */

import { chatAction } from "@/lib/actions/counselor";
import { BadRequest, body, route, str } from "@/lib/api/v1";
import { requireOwnThread } from "@/lib/api/threads";

export const runtime = "nodejs";
export const maxDuration = 60;

export const POST = route<{ id: string }>(
  "threads:chat",
  "The counselor couldn't answer just now. Try again in a moment.",
  async (request, { id }) => {
    const threadId = await requireOwnThread(id);
    const b = await body(request);
    const message = str(b.message, "message", 8_000).trim();
    if (!message) throw new BadRequest("Write something first.");

    const ctx = (b.context ?? {}) as Record<string, unknown>;
    return chatAction({
      threadId,
      message,
      context: {
        schoolId: typeof ctx.schoolId === "string" ? ctx.schoolId : undefined,
        screen: typeof ctx.screen === "string" ? ctx.screen : undefined,
      },
    });
  },
);
