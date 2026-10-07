/* GET /api/v1/opportunities — the summer & opportunities catalogue */

import { requireViewer } from "@/lib/auth/policy";
import { opportunities } from "@/lib/data/opportunities";
import { route } from "@/lib/api/v1";

export const runtime = "nodejs";

export const GET = route("opportunities", "We couldn't load opportunities.", async () => {
  await requireViewer();
  return opportunities;
});
