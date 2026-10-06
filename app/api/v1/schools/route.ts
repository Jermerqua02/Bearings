/* ————————————————————————————————————————
   GET /api/v1/schools?ids=a,b,c

   Schools the snapshot doesn't carry — the counselor names schools a
   student has never saved. Capped at 50 by getSchoolsAction.
   ———————————————————————————————————————— */

import { getSchoolsAction } from "@/lib/actions/schools";
import { route } from "@/lib/api/v1";

export const runtime = "nodejs";

export const GET = route("schools", "We couldn't load those schools.", async (request) => {
  const ids = (new URL(request.url).searchParams.get("ids") ?? "").split(",").filter(Boolean);
  return getSchoolsAction(ids);
});
