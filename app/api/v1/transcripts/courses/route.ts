/* ————————————————————————————————————————
   POST /api/v1/transcripts/courses { courses: ExtractedCourse[] }

   The courses the student confirmed from a reading. addExtractedCoursesAction
   validates every field and skips duplicates; its result is answered as-is.
   ———————————————————————————————————————— */

import { addExtractedCoursesAction } from "@/lib/actions/transcript";
import { BadRequest, body, route } from "@/lib/api/v1";
import type { ExtractedCourse } from "@/lib/types";

export const runtime = "nodejs";

export const POST = route("transcript:add", "We couldn't add those courses.", async (request) => {
  const { courses } = await body(request);
  if (!Array.isArray(courses)) throw new BadRequest("Invalid courses.");
  return addExtractedCoursesAction(courses as ExtractedCourse[]);
});
