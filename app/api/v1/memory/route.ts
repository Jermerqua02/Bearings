/* ————————————————————————————————————————
   GET  /api/v1/memory — what the counselor remembers, with the topics
   POST /api/v1/memory { category, fact } — the student tells it directly

   Private to whoever the counselor is talking to — a student's notes, or a
   parent's own (with a parent's topics). Neither ever reads the other's,
   the same as the threads these facts come from.
   ———————————————————————————————————————— */

import { requireViewer } from "@/lib/auth/policy";
import { addMemories, getMemories } from "@/lib/db/queries/memory";
import { memoryCategoriesFor } from "@/lib/memory";
import { BadRequest, body, nonEmpty, oneOf, route } from "@/lib/api/v1";

export const runtime = "nodejs";

export const GET = route("memory", "We couldn't load what your counselor remembers.", async () => {
  const viewer = await requireViewer();
  return { categories: memoryCategoriesFor(viewer.role), facts: await getMemories(viewer, viewer.userId) };
});

export const POST = route("memory:add", "We couldn't save that.", async (request) => {
  const viewer = await requireViewer();
  const b = await body(request);
  const category = oneOf(b.category, memoryCategoriesFor(viewer.role).map((c) => c.id), "topic");
  const fact = nonEmpty(b.fact, "note", 280);
  const [saved] = await addMemories(viewer.userId, [{ category, fact }], "student");
  if (!saved) throw new BadRequest("Your counselor already has that one.");
  return saved;
});
