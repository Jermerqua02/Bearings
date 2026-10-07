/* POST /api/v1/activities { name, role? } → { id } */

import { addActivityAction } from "@/lib/actions/data";
import { BadRequest, body, route } from "@/lib/api/v1";
import { activityPatch } from "@/lib/api/planner";

export const runtime = "nodejs";

export const POST = route("activity:add", "We couldn't add that activity.", async (request) => {
  const p = activityPatch(await body(request));
  if (!p.name) throw new BadRequest("Give the activity a name.");
  // Same starting figures as the web form; the student edits from there.
  const id = await addActivityAction({
    id: "",
    name: p.name,
    role: p.role ?? "",
    hoursPerWeek: p.hoursPerWeek ?? 2,
    weeksPerYear: p.weeksPerYear ?? 30,
    description: p.description ?? "",
    yearsInvolved: p.yearsInvolved ?? [],
    leadership: p.leadership ?? false,
  });
  return { id };
});
