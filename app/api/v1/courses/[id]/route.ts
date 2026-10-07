/* PATCH / DELETE /api/v1/courses/:id */

import { removeCourseAction, updateCourseAction } from "@/lib/actions/data";
import { body, route, uuid } from "@/lib/api/v1";
import { coursePatch } from "@/lib/api/planner";

export const runtime = "nodejs";

type P = { id: string };

export const PATCH = route<P>("course:update", "We couldn't save that change.", async (request, { id }) => {
  await updateCourseAction(uuid(id), coursePatch(await body(request)));
});

export const DELETE = route<P>("course:remove", "We couldn't remove that course.", async (_r, { id }) => {
  await removeCourseAction(uuid(id));
});
