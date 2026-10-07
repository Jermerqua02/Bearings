/* ————————————————————————————————————————
   GET /api/v1/schools/:id

   One school, with everything the detail page works out about it for this
   student: the chance read and its caveat, the fit reasons, and the net
   price we'd estimate from their budget. Computed here with lib/match so
   the phone and the site can't disagree about a student's chances.
   ———————————————————————————————————————— */

import { requireViewer } from "@/lib/auth/policy";
import { getSchoolById } from "@/lib/db/queries/schools";
import { loadProfileOnly } from "@/lib/db/queries/snapshot";
import { chanceRead, fit, nextDeadline } from "@/lib/match";
import { NotFound, route } from "@/lib/api/v1";

export const runtime = "nodejs";

export const GET = route<{ id: string }>("school", "We couldn't load that school.", async (_r, { id }) => {
  const viewer = await requireViewer();
  const [school, profile] = await Promise.all([
    getSchoolById(decodeURIComponent(id)),
    loadProfileOnly(viewer),
  ]);
  if (!school) throw new NotFound();

  const student = profile?.role === "student" ? profile : null;
  const read = student ? chanceRead(student, school) : null;
  const f = student ? fit(student, school) : null;

  // Same banding as SchoolDetail.tsx: the student's stated budget picks the
  // income band that best matches it; no budget, the school's average.
  const income = school.cost.netPriceByIncome;
  const budget = student?.budget.maxPerYear;
  const estimate =
    budget === undefined
      ? school.cost.avgNetPrice
      : budget <= 30000
        ? income.k48to75
        : budget <= 50000
          ? income.k75to110
          : income.over110k;

  const dl = nextDeadline(school);
  return {
    school,
    chance: read,
    fit: f ? { label: f.label, reasons: f.reasons } : null,
    estimate: estimate ?? null,
    deadline: dl ? { plan: dl.plan, date: dl.iso } : null,
    you: student
      ? { gpaUnweighted: student.gpa.unweighted ?? null, sat: student.testScores.sat ?? null }
      : null,
  };
});
