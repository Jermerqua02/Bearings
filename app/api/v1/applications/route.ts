/* ————————————————————————————————————————
   GET /api/v1/applications

   The tracker on the Apply page, one card per school on the list: which
   round to choose (and whether it's worth asking), what the school
   requires — checked against the student's own essays and recommenders —
   the fee, and where to apply. All of it from lib/requirements and
   lib/schools, the same functions the web tracker renders from.
   ———————————————————————————————————————— */

import { requireViewer } from "@/lib/auth/policy";
import { loadSnapshot } from "@/lib/db/queries/snapshot";
import { applyRoutes, attribution, emptyReason, feeLabel, requirementLines } from "@/lib/requirements";
import { ALL_APPLICATION_PLANS, planLabel, planPrompt, planWhy } from "@/lib/schools";
import { formatDueDate } from "@/lib/format";
import { route } from "@/lib/api/v1";

export const runtime = "nodejs";

export const GET = route("applications", "We couldn't load your applications.", async () => {
  const viewer = await requireViewer();
  const snap = await loadSnapshot(viewer);
  const byId = new Map(snap.schools.map((s) => [s.id, s]));

  const cards = snap.list.flatMap((entry) => {
    const school = byId.get(entry.schoolId);
    if (!school) return [];
    const prompt = planPrompt(school);
    // Every plan, with its date where we have one, for the "change round" menu.
    const plans = ALL_APPLICATION_PLANS.map((p) => ({
      id: p,
      label: planLabel[p],
      due: formatDueDate(school.admissions.deadlines[p]) ?? null,
      why: planWhy[p],
    }));
    return [
      {
        schoolId: school.id,
        prompt,
        plans,
        requirements: requirementLines(school, { essays: snap.essays, recommenders: snap.recommenders }),
        emptyReason: emptyReason(school),
        fee: feeLabel(school),
        routes: applyRoutes(school),
        attribution: attribution(school),
      },
    ];
  });

  return { cards };
});
