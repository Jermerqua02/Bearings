/* ————————————————————————————————————————
   Transcript download.

   GET /api/transcript/[id]

   The opposite of the school-logo route in every way that matters. That one
   is public because a logo is not personal information; this one is the
   single most identifying document in the product, so it is scoped to the
   owner, never cached, and returns 404 rather than 403 for someone else's
   file — a 403 would confirm the id exists.
   ———————————————————————————————————————— */

import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { transcripts } from "@/lib/db/schema";
import { getViewer } from "@/lib/auth/policy";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const viewer = await getViewer();
  if (!viewer) return new NextResponse(null, { status: 404 });

  const { id } = await params;

  // Postgres throws on a malformed uuid comparison rather than returning no
  // rows, which would surface as a 500 for anyone typing a URL by hand.
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return new NextResponse(null, { status: 404 });
  }

  const [row] = await db
    .select({
      bytes: transcripts.bytes,
      contentType: transcripts.contentType,
      filename: transcripts.filename,
    })
    .from(transcripts)
    // Ownership is part of the WHERE, not a check afterwards: there is no
    // path through this handler that reads another student's row at all.
    .where(and(eq(transcripts.id, id), eq(transcripts.studentId, viewer.userId)))
    .limit(1);

  if (!row) return new NextResponse(null, { status: 404 });

  return new NextResponse(new Uint8Array(row.bytes), {
    headers: {
      "Content-Type": row.contentType,
      "Content-Length": String(row.bytes.length),
      // Quoted and stripped of quotes/newlines — a filename is user input.
      "Content-Disposition": `attachment; filename="${row.filename.replace(/["\r\n]/g, "")}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
