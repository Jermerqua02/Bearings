/* ————————————————————————————————————————
   GET /api/v1/schools/:id/why

   "Why this might be right for you" — a model call, cached per student and
   school until their profile changes (whyThisSchoolAction). Separate from
   the detail route so the page can render before the model answers.
   ———————————————————————————————————————— */

import { whyThisSchoolAction } from "@/lib/actions/counselor";
import { route } from "@/lib/api/v1";

export const runtime = "nodejs";
export const maxDuration = 60;

export const GET = route<{ id: string }>(
  "school:why",
  "The counselor couldn't write this one just now.",
  async (_r, { id }) => ({ text: await whyThisSchoolAction(decodeURIComponent(id)) }),
);
