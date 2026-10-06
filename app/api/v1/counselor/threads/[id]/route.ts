/* ————————————————————————————————————————
   PATCH  /api/v1/counselor/threads/:id  { title } — rename
   DELETE /api/v1/counselor/threads/:id            — delete with its messages
   ———————————————————————————————————————— */

import { deleteThreadAction, renameThreadAction } from "@/lib/actions/counselor";
import { body, route, str, uuid } from "@/lib/api/v1";

export const runtime = "nodejs";

type P = { id: string };

export const PATCH = route<P>("threads:rename", "We couldn't rename that.", async (request, { id }) => {
  const b = await body(request);
  await renameThreadAction(uuid(id), str(b.title, "title", 200));
});

export const DELETE = route<P>("threads:delete", "We couldn't delete that.", async (_r, { id }) => {
  await deleteThreadAction(uuid(id));
});
