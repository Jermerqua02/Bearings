/* PATCH /api/v1/memory/:id { fact?, category? } — correct a note
   DELETE /api/v1/memory/:id                   — forget it */

import { requireViewer } from "@/lib/auth/policy";
import { deleteMemory, updateMemory } from "@/lib/db/queries/memory";
import { memoryCategoriesFor } from "@/lib/memory";
import { NotFound, body, nonEmpty, optionalOneOf, route, uuid } from "@/lib/api/v1";

export const runtime = "nodejs";

type P = { id: string };

export const PATCH = route<P>("memory:update", "We couldn't save that change.", async (request, { id }) => {
  const viewer = await requireViewer();
  const b = await body(request);
  const ok = await updateMemory(viewer.userId, uuid(id), {
    fact: b.fact === undefined ? undefined : nonEmpty(b.fact, "note", 280),
    category: optionalOneOf(b.category, memoryCategoriesFor(viewer.role).map((c) => c.id), "topic"),
  });
  if (!ok) throw new NotFound();
});

export const DELETE = route<P>("memory:delete", "We couldn't remove that.", async (_r, { id }) => {
  const viewer = await requireViewer();
  if (!(await deleteMemory(viewer.userId, uuid(id)))) throw new NotFound();
});
