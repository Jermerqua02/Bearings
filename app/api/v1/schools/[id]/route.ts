/* ————————————————————————————————————————
   GET /api/v1/schools/:id

   One school, with everything the detail page works out about it for this
   student: the chance read and its caveat, the fit reasons, and the net
   price we'd estimate from their budget. Computed here with lib/match so
   the phone and the site can't disagree about a student's chances.
   ———————————————————————————————————————— */

import { requireViewer, subjectStudentId } from "@/lib/auth/policy";
import { getSchoolById } from "@/lib/db/queries/schools";
import { subjectProfile } from "@/lib/db/queries/snapshot";
import { chanceRead, fit, nextDeadline } from "@/lib/match";
import { NotFound, route } from "@/lib/api/v1";
import { adjustForResidency, residencyAt, US_STATES } from "@/lib/residency";
import { inFreeDirectory, isPro, proStatus } from "@/lib/entitlements";
import { ProRequired } from "@/lib/actions/_error";

export const runtime = "nodejs";

export const GET = route<{ id: string }>("school", "We couldn't load that school.", async (_r, { id }) => {
  const viewer = await requireViewer();
  // The viewer, or a parent's linked student — see subjectProfile().
  const [school, subject] = await Promise.all([
    getSchoolById(decodeURIComponent(id)),
    subjectProfile(viewer),
  ]);
  if (!school) throw new NotFound();

  // What this school means for *this* student — chances, fit, their price,
  // where they stand against the middle 50% — is Pro. A Free account gets
  // the published facts only; the personal half isn't computed, so no
  // client can show it (docs/plans/lumni-pro.md).
  const pro = isPro(await proStatus(viewer.userId, viewer.role));
  // Free browses the 40 hand-written schools, and anything already on a list
  // they can see — a parent's own, and their student's; the rest is Pro.
  const owners = [viewer.userId, (await subjectStudentId(viewer)) ?? viewer.userId];
  if (!pro && !(await inFreeDirectory(owners, school.id))) {
    throw new ProRequired("Lumni Free covers 40 well-known schools. Pro opens every school — with your chances and your real cost at each.");
  }
  // Chances and fit need a student's grades: theirs, or a linked parent's
  // student's. Price needs only a budget and a state, so an unlinked parent
  // still gets theirs.
  const student = pro && subject?.linked ? subject.profile : null;
  const priced = pro && subject ? subject.profile : null;
  const own = student ? chanceRead(student, school) : null;
  // The caveat speaks to the student ("your GPA"); to their parent it names them.
  const read = own && subject?.isParent && own.caveat
    ? { ...own, caveat: own.caveat.replace(/\byour\b/g, `${subject.name}'s`) }
    : own;
  // Those figures are in-state at a public school; where the family lives
  // decides what's added on top (lib/residency.ts), budget fit included.
  const homeState = priced?.homeState;
  const residency = residencyAt(school, homeState);
  const f = student ? fit(student, school, adjustForResidency(school.cost.avgNetPrice, residency)) : null;

  // Same banding as SchoolDetail.tsx: the student's stated budget picks the
  // income band that best matches it; no budget, the school's average.
  const income = school.cost.netPriceByIncome;
  const budget = priced?.budget.maxPerYear;
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
    // The student's own numbers, to themselves only — a parent gets the
    // read, never the grades behind it.
    you: student && !subject?.isParent
      ? { gpaUnweighted: student.gpa.unweighted ?? null, sat: student.testScores.sat ?? null }
      : null,
    subject: subject ? { name: subject.name, linked: subject.linked, isParent: subject.isParent } : null,
  };
});
