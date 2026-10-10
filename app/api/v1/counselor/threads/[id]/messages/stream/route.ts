/* ————————————————————————————————————————
   POST /api/v1/counselor/threads/:id/messages/stream  { message, context? }

   The same turn as …/messages, answered as server-sent events so the app
   can show the reply as it's written instead of a long "Thinking…":

     event: phase  data: {"phase":"thinking"|"writing"|"cards"}
     event: text   data: {"delta":"…"}           the answer, piece by piece
     event: reply  data: {"message":{…}}         the saved message, cards and all
     event: done   data: {"title":"…"}           title only on the first message
     event: error  data: {"error":"…"}           written for the student

   `reply` is authoritative — the streamed text is a preview of it. Anything
   wrong with the request itself (auth, ownership, an empty message) is a
   plain JSON error with a status, like every other route, because it's
   known before the stream opens.
   ———————————————————————————————————————— */

import { chatAction } from "@/lib/actions/counselor";
import { safeError } from "@/lib/actions/_error";
import { BadRequest, body, errorResponse, str } from "@/lib/api/v1";
import { requireOwnThread } from "@/lib/api/threads";
import { requireViewer } from "@/lib/auth/policy";
import { assertFeature } from "@/lib/entitlements";

export const runtime = "nodejs";
export const maxDuration = 60;

const USER_MESSAGE = "The counselor couldn't answer just now. Try again in a moment.";

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  let input: Parameters<typeof chatAction>[0];
  try {
    const threadId = await requireOwnThread((await ctx.params).id);
    // Checked before the stream opens, so running out of the Free sample is
    // a 402 the app can turn into the paywall — not an error mid-stream.
    const viewer = await requireViewer();
    await assertFeature(viewer.userId, "chat");
    const b = await body(request);
    const message = str(b.message, "message", 8_000).trim();
    if (!message) throw new BadRequest("Write something first.");
    const c = (b.context ?? {}) as Record<string, unknown>;
    input = {
      threadId,
      message,
      context: {
        schoolId: typeof c.schoolId === "string" ? c.schoolId : undefined,
        screen: typeof c.screen === "string" ? c.screen : undefined,
      },
    };
  } catch (err) {
    return errorResponse("threads:chat-stream", err, USER_MESSAGE);
  }

  const encoder = new TextEncoder();
  // If the app goes away mid-answer (backgrounded, left the screen, lost
  // signal), the turn still runs to the end and saves: they'll find the
  // reply in the thread. Only the sending stops.
  let closed = false;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          closed = true;
        }
      };
      try {
        const { title } = await chatAction(input, {
          onPhase: (phase) => send("phase", { phase }),
          onText: (delta) => send("text", { delta }),
          onReply: (message) => send("reply", { message }),
        });
        send("done", title ? { title } : {});
      } catch (err) {
        send("error", { error: safeError("api:threads:chat-stream", err, USER_MESSAGE) });
      } finally {
        if (!closed) {
          closed = true;
          try {
            controller.close();
          } catch {}
        }
      }
    },
    cancel() {
      closed = true;
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      // no-transform: a proxy that compresses would hold the events back.
      "Cache-Control": "private, no-store, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
