/* ————————————————————————————————————————
   POST /api/v1/list  { schoolId, tier, plan?, status? } — add a school
   ———————————————————————————————————————— */

import { addToListAction } from "@/lib/actions/data";
import { body, nonEmpty, oneOf, optionalOneOf, route } from "@/lib/api/v1";
import { PLANS, STATUSES, TIERS } from "@/lib/api/list";

export const runtime = "nodejs";

export const POST = route("list:add", "We couldn't add that school.", async (request) => {
  const b = await body(request);
  await addToListAction({
    schoolId: nonEmpty(b.schoolId, "school"),
    tier: oneOf(b.tier, TIERS, "tier"),
    plan: optionalOneOf(b.plan, PLANS, "plan"),
    status: b.status === undefined ? "considering" : oneOf(b.status, STATUSES, "status"),
  });
});
