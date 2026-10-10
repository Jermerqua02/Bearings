/* ————————————————————————————————————————
   GET  /api/v1/free-access — this account's latest request, if any
   POST /api/v1/free-access { message, schoolName? } — ask for free Pro

   lib/free-access.ts decides; admins approve in Admin › Free access.
   ———————————————————————————————————————— */

import { requireViewer } from "@/lib/auth/policy";
import { body, route, str } from "@/lib/api/v1";
import { myFreeAccessRequest, requestFreeAccess } from "@/lib/free-access";

export const runtime = "nodejs";

export const GET = route("free-access", "We couldn't load your request.", async () => ({
  request: await myFreeAccessRequest(await requireViewer()),
}));

export const POST = route("free-access", "We couldn't send your request. Try again in a moment.", async (request) => {
  const viewer = await requireViewer();
  const b = await body(request);
  const message = str(b.message, "message", 1_000);
  const schoolName = typeof b.schoolName === "string" ? b.schoolName : undefined;
  return { request: await requestFreeAccess(viewer, { message, schoolName }) };
});
