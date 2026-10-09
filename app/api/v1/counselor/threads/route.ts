/* ————————————————————————————————————————
   GET  /api/v1/counselor/threads  — every conversation, with messages
   POST /api/v1/counselor/threads  { title?, schoolId? } — start one; answers { id }
   ———————————————————————————————————————— */

import { createThreadAction, listThreadsAction } from "@/lib/actions/counselor";
import { route, str } from "@/lib/api/v1";

export const runtime = "nodejs";

export const GET = route("threads", "We couldn't load your conversations.", async () =>
  listThreadsAction(),
);

export const POST = route("threads:create", "We couldn't start a conversation.", async (request) => {
  // A body is optional — "About Reed College", and the school, when opened
  // from a school's page.
  const b = await request.json().catch(() => ({}));
  const title = b && typeof b === "object" && "title" in b ? str(b.title, "title", 60).trim() : "";
  const schoolId = b && typeof b === "object" && "schoolId" in b ? str(b.schoolId, "schoolId", 100).trim() : "";
  return { id: await createThreadAction(title || undefined, schoolId || undefined) };
});
