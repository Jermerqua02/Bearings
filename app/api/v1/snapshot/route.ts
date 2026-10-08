/* ————————————————————————————————————————
   GET /api/v1/snapshot

   Everything the signed-in viewer may see, in one round trip — the same
   AppSnapshot the root layout hydrates the website from. A parent's private
   slices come back empty because loadSnapshot never fetched them.
   ———————————————————————————————————————— */

import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { userAvatars } from "@/lib/db/schema";
import { requireViewer } from "@/lib/auth/policy";
import { loadSnapshot } from "@/lib/db/queries/snapshot";
import { route } from "@/lib/api/v1";

export const runtime = "nodejs";

export const GET = route("snapshot", "We couldn't load your account just now.", async () => {
  const viewer = await requireViewer();
  const [snapshot, [avatar]] = await Promise.all([
    loadSnapshot(viewer),
    // Only when it last changed — the app fetches the bytes itself, and
    // uses this to know when its copy is stale.
    db
      .select({ updatedAt: userAvatars.updatedAt })
      .from(userAvatars)
      .where(eq(userAvatars.userId, viewer.userId))
      .limit(1),
  ]);
  return {
    viewer: {
      id: viewer.userId,
      name: viewer.name,
      email: viewer.email,
      role: viewer.role,
      avatarUpdatedAt: avatar?.updatedAt.toISOString() ?? null,
    },
    snapshot,
  };
});
