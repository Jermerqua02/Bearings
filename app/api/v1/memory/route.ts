/* ————————————————————————————————————————
   GET  /api/v1/memory — what the counselor remembers, with the topics
   POST /api/v1/memory { category, fact } — the student tells it directly

   Student-private: the policy refuses a parent, the same as the threads
   these facts come from.
   ———————————————————————————————————————— */

import { requireStudent } from "@/lib/auth/policy";
import { addMemories, getMemories } from "@/lib/db/queries/memory";
import { MEMORY_CATEGORIES } from "@/lib/memory";
import { BadRequest, body, nonEmpty, oneOf, route } from "@/lib/api/v1";

export const runtime = "nodejs";

export const GET = route("memory", "We couldn't load what your counselor remembers.", async () => {
  const viewer = await requireStudent();
  return { categories: MEMORY_CATEGORIES, facts: await getMemories(viewer, viewer.userId) };
});

export const POST = route("memory:add", "We couldn't save that.", async (request) => {
  const viewer = await requireStudent();
  const b = await body(request);
  const category = oneOf(b.category, MEMORY_CATEGORIES.map((c) => c.id), "topic");
  const fact = nonEmpty(b.fact, "note", 280);
  const [saved] = await addMemories(viewer.userId, [{ category, fact }], "student");
  if (!saved) throw new BadRequest("Your counselor already has that one.");
  return saved;
});
