/* ————————————————————————————————————————
   POST /api/v1/transcripts/:id/read { force? }

   Have the model read an uploaded transcript. Answers the ReadResult from
   readTranscriptAction as-is — its errors are already written for the
   student, so { ok: false, error } is a 200, not a failure of the API.
   ———————————————————————————————————————— */

import { readTranscriptAction } from "@/lib/actions/transcript";
import { body, route, uuid } from "@/lib/api/v1";

export const runtime = "nodejs";
export const maxDuration = 120;

export const POST = route<{ id: string }>("transcript:read", "We couldn't read that file.", async (request, { id }) => {
  const b = await body(request).catch(() => ({}) as Record<string, unknown>);
  return readTranscriptAction(uuid(id), { force: b.force === true });
});
