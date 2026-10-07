/* POST /api/v1/courses { year, subject, name, level, status?, grade? } → { id } */

import { addCourseAction } from "@/lib/actions/data";
import { BadRequest, body, route } from "@/lib/api/v1";
import { coursePatch } from "@/lib/api/planner";

export const runtime = "nodejs";

export const POST = route("course:add", "We couldn't add that course.", async (request) => {
  const p = coursePatch(await body(request));
  if (!p.year || !p.subject || !p.name || !p.level) throw new BadRequest("A course needs a year, subject, name and level.");
  const id = await addCourseAction({
    id: "",
    year: p.year,
    subject: p.subject,
    name: p.name,
    level: p.level,
    status: p.status ?? "planned",
    grade: p.grade,
  });
  return { id };
});
