/* ————————————————————————————————————————
   Transcript upload.

   POST /api/transcript  (multipart/form-data, field "file")

   A route handler rather than a server action, for one reason: server
   actions post through Next's encrypted action channel, which caps request
   bodies at 1 MB by default. A scanned four-year transcript is routinely
   larger than that, and the failure mode is a generic action error with
   nothing pointing at the size. Route handlers stream the body and have no
   such cap.

   Everything else follows the rules the actions follow — the student comes
   from the session, never from the payload, and a parent has no write path.
   ———————————————————————————————————————— */

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { transcripts } from "@/lib/db/schema";
import { requireStudent } from "@/lib/auth/policy";
import { safeError } from "@/lib/actions/_error";
import { TRANSCRIPT_MEDIA_TYPES } from "@/lib/counselor/claude";

export const runtime = "nodejs";

/**
 * 15 MB. Comfortably above a phone photo of a transcript or a scanned PDF,
 * and well under the 32 MB the Anthropic API accepts for a request — the
 * file is base64'd into that request, which inflates it by a third.
 */
const MAX_BYTES = 15 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    const student = await requireStudent();

    const form = await request.formData();
    const file = form.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file was attached." }, { status: 400 });
    }

    if (!(TRANSCRIPT_MEDIA_TYPES as readonly string[]).includes(file.type)) {
      return NextResponse.json(
        { error: "Upload a PDF or a photo (PNG, JPEG or WebP) of your transcript." },
        { status: 415 },
      );
    }

    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: `That file is ${Math.round(file.size / 1024 / 1024)} MB. The limit is 15 MB.` },
        { status: 413 },
      );
    }
    if (file.size === 0) {
      return NextResponse.json({ error: "That file is empty." }, { status: 400 });
    }

    const bytes = Buffer.from(await file.arrayBuffer());

    const [row] = await db
      .insert(transcripts)
      .values({
        studentId: student.userId,
        // A filename comes from the user's disk and gets rendered and sent
        // as a Content-Disposition later. Keep the basename only.
        filename: (file.name.split(/[\\/]/).pop() || "transcript").slice(0, 200),
        contentType: file.type,
        sizeBytes: bytes.length,
        bytes,
      })
      .returning({
        id: transcripts.id,
        filename: transcripts.filename,
        contentType: transcripts.contentType,
        sizeBytes: transcripts.sizeBytes,
        createdAt: transcripts.createdAt,
      });

    return NextResponse.json({
      id: row.id,
      filename: row.filename,
      contentType: row.contentType,
      sizeBytes: row.sizeBytes,
      uploadedAt: row.createdAt.toISOString(),
      courseCount: null,
    });
  } catch (err) {
    return NextResponse.json(
      { error: safeError("transcript-upload", err, "We couldn't save that file. Try again.") },
      { status: 500 },
    );
  }
}
