/* ————————————————————————————————————————
   Fetching schools the snapshot doesn't carry.

   The snapshot hydrates only the schools a student's own records point at,
   which is right for every page except this one: the counselor's whole job
   includes naming schools they have never saved. "What am I missing?" is
   the question, and the answer is by definition not on their list.
   ———————————————————————————————————————— */

"use server";

import { requireViewer } from "@/lib/auth/policy";
import { getSchoolsByIds } from "@/lib/db/queries/schools";
import type { School } from "@/lib/types";

/**
 * Reference data, so this needs a session but no ownership check — every
 * signed-in user may read any school. Capped so a crafted request can't ask
 * for the whole table in one call.
 */
export async function getSchoolsAction(ids: string[]): Promise<School[]> {
  await requireViewer();
  if (!Array.isArray(ids) || ids.length === 0) return [];
  return getSchoolsByIds(ids.slice(0, 50));
}
