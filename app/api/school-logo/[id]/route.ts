/* ————————————————————————————————————————
   School logos, served from our own domain.

   GET /api/school-logo/[id]

   The bytes were fetched once at import time and stored (see
   scripts/import-schools.ts). Serving them ourselves rather than pointing
   an <img> at a third party means two things: the link cannot rot, and
   nobody outside Northstar learns which schools a student is looking at.
   That second one matters for a product whose privacy policy promises no
   third-party tracking — a favicon service would have seen every card.

   Public on purpose. A school's logo is not personal information, and the
   only thing an unauthenticated caller learns is that a public institution
   exists. Requiring a session would stop the marketing pages using it.
   ———————————————————————————————————————— */

import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { schoolLogos } from "@/lib/db/schema";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const [row] = await db
    .select({ bytes: schoolLogos.bytes, contentType: schoolLogos.contentType })
    .from(schoolLogos)
    .where(eq(schoolLogos.schoolId, id))
    .limit(1);

  if (!row) {
    // 404 rather than a placeholder image: the client renders a monogram,
    // which looks deliberate and matches the design. A grey box would not.
    return new NextResponse(null, { status: 404 });
  }

  return new NextResponse(new Uint8Array(row.bytes), {
    headers: {
      "Content-Type": row.contentType,
      "Content-Length": String(row.bytes.length),
      // A logo changes roughly never. Cache hard, publicly — there is
      // nothing user-specific in the response.
      "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800, immutable",
    },
  });
}
