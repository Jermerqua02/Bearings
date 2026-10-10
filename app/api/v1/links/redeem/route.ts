/* POST /api/v1/links/redeem { code } — enter someone's code and link. */

import { requireViewer } from "@/lib/auth/policy";
import { body, route, str } from "@/lib/api/v1";
import { redeemLinkCode } from "@/lib/link-codes";

export const runtime = "nodejs";

export const POST = route("links:redeem", "We couldn't link the accounts.", async (request) => {
  const viewer = await requireViewer();
  const code = str((await body(request)).code, "code", 20);
  const linked = await redeemLinkCode(viewer, code);
  return { linked: { ...linked, since: linked.since?.toISOString() ?? null } };
});
