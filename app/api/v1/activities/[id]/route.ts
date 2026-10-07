/* PATCH / DELETE /api/v1/activities/:id */

import { removeActivityAction, updateActivityAction } from "@/lib/actions/data";
import { body, route, uuid } from "@/lib/api/v1";
import { activityPatch } from "@/lib/api/planner";

export const runtime = "nodejs";

type P = { id: string };

export const PATCH = route<P>("activity:update", "We couldn't save that change.", async (request, { id }) => {
  await updateActivityAction(uuid(id), activityPatch(await body(request)));
});

export const DELETE = route<P>("activity:remove", "We couldn't remove that activity.", async (_r, { id }) => {
  await removeActivityAction(uuid(id));
});
