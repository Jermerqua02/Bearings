/* DELETE /api/v1/transcripts/:id
   Upload and download stay at /api/transcript — they already read the
   bearer session through requireStudent()/getViewer(). */

import { removeTranscriptAction } from "@/lib/actions/transcript";
import { route, uuid } from "@/lib/api/v1";

export const runtime = "nodejs";

export const DELETE = route<{ id: string }>("transcript:remove", "We couldn't remove that file.", async (_r, { id }) => {
  await removeTranscriptAction(uuid(id));
});
