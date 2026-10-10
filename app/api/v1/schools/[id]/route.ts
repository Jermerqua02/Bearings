/* ————————————————————————————————————————
   GET /api/v1/schools/:id

   One school, with everything the detail page works out about it for this
   student: the chance read and its caveat, the fit reasons, and the net
   price we'd estimate from their budget. Computed here with lib/match so
   the phone and the site can't disagree about a student's chances.
   ———————————————————————————————————————— */

import { requireViewer, subjectStudentId } from "@/lib/auth/policy";
import { getSchoolById } from "@/lib/db/queries/schools";
import { loadProfileOnly } from "@/lib/db/queries/snapshot";
import { chanceRead, fit, nextDeadline } from "@/lib/match";
import { NotFound, route } from "@/lib/api/v1";
import { adjustForResidency, residencyAt, US_STATES } from "@/lib/residency";
import { inFreeDirectory, isPro, proStatus } from "@/lib/entitlements";
import { ProRequired } from "@/lib/actions/_error";

export const runtime = "nodejs";

export const GET = route<{ id: string }>("school", "We couldn't load that school.", async (_r, { id }) => {
  const viewer = await requireViewer();
  const [school, profile] = await Promise.all([
    getSchoolById(decodeURIComponent(id)),
    loadProfileOnly(viewer),
  ]);
  if (!school) throw new NotFound();

  // What this school means for *this* student — chances, fit, their price,
  // where they stand against the middle 50% — is Pro. A Free account gets
  // the published facts only; the personal half isn't computed, so no
  // client can show it (docs/plans/lumni-pro.md).
  const pro = isPro(await proStatus(viewer.userId, viewer.role));
  // Free browses the 40 hand-written schools, and anything already on their
  // list; the rest of the directory is Pro.
  if (!pro && !(await inFreeDirectory((await subjectStudentId(viewer)) ?? viewer.userId, school.id))) {
    throw new ProRequired("Lumni Free covers 40 well-known schools. Pro opens every school — with your chances and your real cost at each.");
  }
  const student = pro && profile?.role === "student" ? profile : null;
  const read = student ? chanceRead(student, school) : null;
  // Those figures are in-state at a public school; where the student lives
  // decides what's added on top (lib/residency.ts), budget fit included.
  const homeState = student?.homeState;
  const residency = residencyAt(school, homeState);
  const f = student ? fit(student, school, adjustForResidency(school.cost.avgNetPrice, residency)) : null;

  // Same banding as SchoolDetail.tsx: the student's stated budget picks the
  // income band that best matches it; no budget, the school's average.
  const income = school.cost.netPriceByIncome;
  const budget = student?.budget.maxPerYear;
  const banded =
    budget === undefined
      ? school.cost.avgNetPrice
      : budget <= 30000
        ? income.k48to75
        : budget <= 50000
          ? income.k75to110
          : income.over110k;

  const estimate = adjustForResidency(banded, residency);

  const dl = nextDeadline(school);
  return {
    school,
    chance: read,
    fit: f ? { label: f.label, reasons: f.reasons } : null,
    estimate: pro ? (estimate ?? null) : null,
    locked: !pro,
    residency: !pro ? null : {
      status: residency.status,
      homeState: homeState ?? null,
      homeStateName: homeState ? (US_STATES[homeState] ?? homeState) : null,
      extraPerYear: residency.extraPerYear ?? null,
      outOfStateExtraPerYear: residency.outOfStateExtraPerYear ?? null,
      program: residency.program
        ? {
            name: residency.program.name,
            shortName: residency.program.shortName,
            terms: residency.program.terms,
            howToGet: residency.program.howToGet,
            restrictions: residency.program.restrictions ?? null,
            url: residency.program.schoolUrl ?? residency.program.url,
          }
        : null,
      // Exchanges that hinge on their major or county: worth asking about.
      maybe: (residency.maybe ?? []).map((p) => ({
        name: p.name,
        shortName: p.shortName,
        terms: p.terms,
        howToGet: p.howToGet,
        restrictions: p.restrictions ?? null,
        url: p.schoolUrl ?? p.url,
      })),
    },
    deadline: dl ? { plan: dl.plan, date: dl.iso } : null,
    you: student
      ? { gpaUnweighted: student.gpa.unweighted ?? null, sat: student.testScores.sat ?? null }
      : null,
  };
});
