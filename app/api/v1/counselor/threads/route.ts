/* ————————————————————————————————————————
   GET  /api/v1/counselor/threads  — every conversation, with messages
   POST /api/v1/counselor/threads  { title? } — start one; answers { id }
   ———————————————————————————————————————— */

import { createThreadAction, listThreadsAction } from "@/lib/actions/counselor";
import { route, str } from "@/lib/api/v1";

export const runtime = "nodejs";

export const GET = route("threads", "We couldn't load your conversations.", async () =>
  listThreadsAction(),
);

export const POST = route("threads:create", "We couldn't start a conversation.", async (request) => {
  // A body is optional — "About Reed College" when opened from a school.
  const b = await request.json().catch(() => ({}));
  const title = b && typeof b === "object" && "title" in b ? str(b.title, "title", 60).trim() : "";
  return { id: await createThreadAction(title || undefined) };
});
