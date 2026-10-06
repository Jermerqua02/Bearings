/* ————————————————————————————————————————
   PATCH  /api/v1/list/:schoolId  { tier?, plan?, status?, outcome?, notes? }
   DELETE /api/v1/list/:schoolId

   An absent key leaves the field alone. There is no clearing a field yet —
   updateListEntryAction skips undefined, and has no way to write null.
   ———————————————————————————————————————— */

import { removeFromListAction, updateListEntryAction } from "@/lib/actions/data";
import { body, optionalOneOf, route, str } from "@/lib/api/v1";
import { OUTCOMES, PLANS, STATUSES, TIERS } from "@/lib/api/list";
import type { ListEntry } from "@/lib/types";

export const runtime = "nodejs";

type P = { schoolId: string };

export const PATCH = route<P>("list:update", "We couldn't save that change.", async (request, { schoolId }) => {
  const b = await body(request);
  const patch: Partial<ListEntry> = {};
  patch.tier = optionalOneOf(b.tier, TIERS, "tier");
  patch.status = optionalOneOf(b.status, STATUSES, "status");
  patch.plan = optionalOneOf(b.plan, PLANS, "plan");
  patch.outcome = optionalOneOf(b.outcome, OUTCOMES, "outcome");
  if (b.notes !== undefined) patch.notes = str(b.notes, "notes");
  await updateListEntryAction(decodeURIComponent(schoolId), patch);
});

export const DELETE = route<P>("list:remove", "We couldn't remove that school.", async (_r, { schoolId }) => {
  await removeFromListAction(decodeURIComponent(schoolId));
});
