/* POST /api/v1/activities/order { ids: [...] } — the student's own ranking */

import { reorderActivitiesAction } from "@/lib/actions/data";
import { BadRequest, body, route, uuid } from "@/lib/api/v1";

export const runtime = "nodejs";

export const POST = route("activity:order", "We couldn't save that order.", async (request) => {
  const { ids } = await body(request);
  if (!Array.isArray(ids) || ids.length > 100) throw new BadRequest("Invalid order.");
  await reorderActivitiesAction(ids.map((id) => uuid(String(id))));
});
