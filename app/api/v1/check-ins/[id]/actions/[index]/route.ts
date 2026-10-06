/* POST /api/v1/check-ins/:id/actions/:index — toggle one item done/undone */

import { toggleCheckInActionAction } from "@/lib/actions/data";
import { BadRequest, route, uuid } from "@/lib/api/v1";

export const runtime = "nodejs";

export const POST = route<{ id: string; index: string }>(
  "check-in:toggle",
  "We couldn't save that.",
  async (_r, { id, index }) => {
    const i = Number(index);
    if (!Number.isInteger(i) || i < 0) throw new BadRequest("Invalid item.");
    await toggleCheckInActionAction(uuid(id), i);
  },
);
