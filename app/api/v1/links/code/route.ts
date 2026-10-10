/* POST /api/v1/links/code — make a code for the other side to enter. */

import { requireViewer } from "@/lib/auth/policy";
import { route } from "@/lib/api/v1";
import { createLinkCode } from "@/lib/link-codes";

export const runtime = "nodejs";

export const POST = route("links:code", "We couldn't make a link code.", async () => {
  const viewer = await requireViewer();
  const { code, expiresAt } = await createLinkCode(viewer);
  return { code, expiresAt: expiresAt.toISOString() };
});
