/* POST /api/v1/school-code { code } — join a school's license: Pro until it ends. */

import { requireViewer } from "@/lib/auth/policy";
import { body, route, str } from "@/lib/api/v1";
import { redeemSchoolCode } from "@/lib/school-licenses";
import { planFor } from "@/lib/entitlements";

export const runtime = "nodejs";

export const POST = route("school-code", "We couldn't use that code just now.", async (request) => {
  const viewer = await requireViewer();
  const { orgName, endsAt } = await redeemSchoolCode(viewer, str((await body(request)).code, "code", 40));
  return { orgName, endsAt: endsAt.toISOString(), plan: await planFor(viewer.userId, viewer.role) };
});
