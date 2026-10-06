/* POST /api/v1/check-ins/:id/dismiss */

import { dismissCheckInAction } from "@/lib/actions/data";
import { route, uuid } from "@/lib/api/v1";

export const runtime = "nodejs";

export const POST = route<{ id: string }>("check-in:dismiss", "We couldn't dismiss that.", async (_r, { id }) => {
  await dismissCheckInAction(uuid(id));
});
