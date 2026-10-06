/* ————————————————————————————————————————
   GET /api/v1/snapshot

   Everything the signed-in viewer may see, in one round trip — the same
   AppSnapshot the root layout hydrates the website from. A parent's private
   slices come back empty because loadSnapshot never fetched them.
   ———————————————————————————————————————— */

import { requireViewer } from "@/lib/auth/policy";
import { loadSnapshot } from "@/lib/db/queries/snapshot";
import { route } from "@/lib/api/v1";

export const runtime = "nodejs";

export const GET = route("snapshot", "We couldn't load your account just now.", async () => {
  const viewer = await requireViewer();
  return {
    viewer: { id: viewer.userId, name: viewer.name, email: viewer.email, role: viewer.role },
    snapshot: await loadSnapshot(viewer),
  };
});
