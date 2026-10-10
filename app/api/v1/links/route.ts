/* ————————————————————————————————————————
   GET    /api/v1/links  — who this account is linked to, and any code out
   DELETE /api/v1/links  — unlink

   Linking is by code, from either side (lib/link-codes.ts): POST
   /api/v1/links/code makes one, POST /api/v1/links/redeem { code } uses one.
   ———————————————————————————————————————— */

import { requireViewer } from "@/lib/auth/policy";
import { route } from "@/lib/api/v1";
import { linkedPerson, pendingCode, unlink } from "@/lib/link-codes";

export const runtime = "nodejs";

export const GET = route("links", "We couldn't load your linked account.", async () => {
  const viewer = await requireViewer();
  const [linked, code] = await Promise.all([linkedPerson(viewer), pendingCode(viewer)]);
  return {
    linked: linked ? { ...linked, since: linked.since?.toISOString() ?? null } : null,
    code: code ? { code: code.code, expiresAt: code.expiresAt.toISOString() } : null,
  };
});

export const DELETE = route("links:unlink", "We couldn't unlink the accounts.", async () => {
  const viewer = await requireViewer();
  await unlink(viewer);
  return { ok: true };
});
