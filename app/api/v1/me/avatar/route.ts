/* ————————————————————————————————————————
   GET    /api/v1/me/avatar  — your photo (404 if you haven't set one)
   POST   /api/v1/me/avatar  — multipart, field "file": set it
   DELETE /api/v1/me/avatar  — remove it

   Only ever your own: the user comes from the session, never the URL,
   so there is no path that serves someone else's face. Most of these are
   minors, which is also why it isn't a public URL on user.image.
   ———————————————————————————————————————— */

import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { userAvatars } from "@/lib/db/schema";
import { requireViewer } from "@/lib/auth/policy";
import { BadRequest, NotFound, route } from "@/lib/api/v1";

export const runtime = "nodejs";

/** The app sends a 512px JPEG; this is headroom, not an invitation. */
const MAX_BYTES = 2 * 1024 * 1024;
const TYPES = ["image/jpeg", "image/png"];

export async function GET() {
  const viewer = await requireViewer().catch(() => null);
  if (!viewer) return new NextResponse(null, { status: 401 });
  const [row] = await db
    .select({ bytes: userAvatars.bytes, contentType: userAvatars.contentType })
    .from(userAvatars)
    .where(eq(userAvatars.userId, viewer.userId))
    .limit(1);
  if (!row) return new NextResponse(null, { status: 404 });
  return new NextResponse(new Uint8Array(row.bytes), {
    headers: {
      "Content-Type": row.contentType,
      "Content-Length": String(row.bytes.length),
      "Cache-Control": "private, no-store",
    },
  });
}

export const POST = route("avatar:set", "We couldn't save that photo.", async (request) => {
  const viewer = await requireViewer();
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) throw new BadRequest("No photo was attached.");
  if (!TYPES.includes(file.type)) throw new BadRequest("Use a JPEG or PNG photo.");
  if (file.size > MAX_BYTES) throw new BadRequest("That photo is too large — try a smaller one.");

  const bytes = Buffer.from(await file.arrayBuffer());
  const now = new Date();
  await db
    .insert(userAvatars)
    .values({ userId: viewer.userId, contentType: file.type, bytes })
    .onConflictDoUpdate({
      target: userAvatars.userId,
      set: { contentType: file.type, bytes, updatedAt: now },
    });
  return { updatedAt: now.toISOString() };
});

export const DELETE = route("avatar:remove", "We couldn't remove that photo.", async () => {
  const viewer = await requireViewer();
  const removed = await db
    .delete(userAvatars)
    .where(eq(userAvatars.userId, viewer.userId))
    .returning({ userId: userAvatars.userId });
  if (removed.length === 0) throw new NotFound();
});
