/* ————————————————————————————————————————
   PUT /api/v1/me/home-state  { state: "WA" | null } — where the student lives

   Decides in-state tuition at public schools and which regional exchanges
   (WUE and the like) they qualify for. Students only: a parent sees their
   student's.
   ———————————————————————————————————————— */

import { requireStudent } from "@/lib/auth/policy";
import { BadRequest, body, route } from "@/lib/api/v1";
import { setHomeState } from "@/lib/db/queries/profile";
import { isUsState } from "@/lib/states";

export const runtime = "nodejs";

export const PUT = route("me:home-state", "We couldn't save your state.", async (request) => {
  const s = await requireStudent();
  const b = await body(request);
  const state = b.state === null ? null : typeof b.state === "string" ? b.state.trim().toUpperCase() : undefined;
  if (state !== null && !isUsState(state)) throw new BadRequest("Pick a state from the list.");
  if (!(await setHomeState(s.userId, state))) throw new BadRequest("Finish onboarding first.");
  return undefined;
});
