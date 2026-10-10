/* POST /api/v1/school-leads — "Bring Lumni to your school", from the app. */

import { requireViewer } from "@/lib/auth/policy";
import { body, route } from "@/lib/api/v1";
import { createSchoolLead } from "@/lib/school-licenses";

export const runtime = "nodejs";

export const POST = route("school-leads", "We couldn't send that. Try again in a moment.", async (request) => {
  const viewer = await requireViewer();
  const b = await body(request);
  await createSchoolLead(
    {
      schoolName: String(b.schoolName ?? ""),
      contactName: String(b.contactName ?? viewer.name ?? ""),
      role: typeof b.role === "string" ? b.role : undefined,
      email: String(b.email ?? viewer.email),
      students: b.students == null ? null : Number(b.students),
      message: typeof b.message === "string" ? b.message : undefined,
    },
    "app",
    viewer.userId,
  );
  return { ok: true };
});
