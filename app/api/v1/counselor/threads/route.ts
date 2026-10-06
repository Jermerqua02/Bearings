/* ————————————————————————————————————————
   GET  /api/v1/counselor/threads  — every conversation, with messages
   POST /api/v1/counselor/threads  — start one; answers { id }
   ———————————————————————————————————————— */

import { createThreadAction, listThreadsAction } from "@/lib/actions/counselor";
import { route } from "@/lib/api/v1";

export const runtime = "nodejs";

export const GET = route("threads", "We couldn't load your conversations.", async () =>
  listThreadsAction(),
);

export const POST = route("threads:create", "We couldn't start a conversation.", async () => ({
  id: await createThreadAction(),
}));
