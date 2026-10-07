/* POST /api/v1/schools/:id/viewed — feeds "Recently viewed" on Home. */

import { markViewedAction } from "@/lib/actions/data";
import { getSchoolById } from "@/lib/db/queries/schools";
import { NotFound, route } from "@/lib/api/v1";

export const runtime = "nodejs";

export const POST = route<{ id: string }>("school:viewed", "Couldn't record that.", async (_r, { id }) => {
  const school = await getSchoolById(decodeURIComponent(id));
  if (!school) throw new NotFound();
  await markViewedAction(school.id);
});
