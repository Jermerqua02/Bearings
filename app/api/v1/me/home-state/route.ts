/* ————————————————————————————————————————
   PUT /api/v1/me/home-state  { state: "WA" | null } — where the family lives

   Decides in-state tuition at public schools and which regional exchanges
   (WUE and the like) they qualify for. A student's is on their profile; a
   parent's on theirs, standing in for a linked student who hasn't said.
   ———————————————————————————————————————— */

import { requireViewer } from "@/lib/auth/policy";
import { BadRequest, body, route } from "@/lib/api/v1";
import { setHomeState } from "@/lib/db/queries/profile";
import { isUsState } from "@/lib/states";

export const runtime = "nodejs";

export const PUT = route("me:home-state", "We couldn't save your state.", async (request) => {
  const viewer = await requireViewer();
  const b = await body(request);
  const state = b.state === null ? null : typeof b.state === "string" ? b.state.trim().toUpperCase() : undefined;
  if (state !== null && !isUsState(state)) throw new BadRequest("Pick a state from the list.");
  const role = viewer.role === "parent" ? "parent" : "student";
  if (!(await setHomeState(viewer.userId, state, role))) throw new BadRequest("Finish onboarding first.");
  return undefined;
});
