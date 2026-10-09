/* ————————————————————————————————————————
   Counselor picks: schools a counselor would actually put in front of this
   student.

   They used to be a hand-written list of fourteen "underrated" schools,
   each with one fixed line ("Out-of-state engineering value"), merely
   sorted by fit. That recommended Purdue to a 3.1 student in Washington
   who wants child development — a reach, out of state with no exchange,
   outside their regions — and the school page, asked why it fits, said
   "Honestly? It mostly doesn't." A pick raises hopes, so it has to clear
   the bar a counselor would:

     - realistic: a target or a likely admit, never a reach — and never a
       school that turns most applicants away, whatever the tier says
     - affordable at their price, out-of-state tuition and exchanges
       included, within their budget plus a little room for aid
     - somewhere they said they'd go, unless nothing there qualifies
     - a school a counselor would stand behind: most students finish
       there, and it isn't so small that the data is mostly guesswork

   The reason is built from those same facts, about this student.
   ———————————————————————————————————————— */

import "server-only";

import { searchSchools } from "@/lib/db/queries/schools";
import { chanceRead, fit } from "@/lib/match";
import { adjustForResidency, residencyAt } from "@/lib/residency";
import type { School, StudentProfile } from "@/lib/types";

export interface CounselorPick {
  school: School;
  reason: string;
}

/** How far over budget a pick may run: within reach of a little aid. */
const BUDGET_ROOM = 5_000;
/** Six-year graduation rate a pick has to show. Unknown doesn't pass. */
const MIN_GRAD_RATE = 0.55;
const MIN_UNDERGRADS = 1_000;
/** Below this admit rate a school is a lottery for everyone: never a pick. */
const MIN_ADMIT_RATE = 0.3;
/** Territories are listed, but not recommended from the mainland. */
const TERRITORIES = new Set(["PR", "GU", "VI", "MP", "AS"]);

export async function counselorPicksFor(profile: StudentProfile, limit = 4): Promise<CounselorPick[]> {
  const regions = profile.geography.regions;
  // The database's "fit" order is coarser than fit() — the first 80 left out
  // a Washington student's own state universities — so this takes every
  // realistic school in their regions (a few hundred) and ranks them here.
  const realistic = { tiers: ["target", "likely"] as ("target" | "likely")[], sort: "fit" as const, page: 1, perPage: 600 };
  let pool = (await searchSchools(profile, { ...realistic, regions: regions.length ? regions : undefined })).schools;
  // Nothing realistic where they'd go: better a fitting school elsewhere than none.
  if (pool.length < limit && regions.length) pool = (await searchSchools(profile, realistic)).schools;

  const budget = profile.budget.maxPerYear;
  const picks = pool.flatMap((school) => {
    const grad = school.outcomes.gradRate;
    if (grad === undefined || grad < MIN_GRAD_RATE || school.undergradEnrollment < MIN_UNDERGRADS) return [];
    if (TERRITORIES.has(school.state) && school.state !== profile.homeState) return [];
    if ((school.admissions.acceptanceRate ?? 0) < MIN_ADMIT_RATE) return [];
    const read = chanceRead(profile, school);
    if (!read || read.tier === "reach") return [];
    const residency = residencyAt(school, profile.homeState);
    const net = adjustForResidency(school.cost.avgNetPrice, residency);
    if (budget !== undefined && (net === undefined || net > budget + BUDGET_ROOM)) return [];
    const f = fit(profile, school, net);
    // Fit first; then how well students do there (a 90% graduation rate is
    // worth about a point and a half over a 60% one) and how far under
    // budget it lands (up to two points) — fitting the budget is already
    // in fit, but a counselor leans toward the one that leaves room.
    // The editors' "underrated" schools get a nudge when they clear the bar
    // on their own. A religious college ranks for those who said that matters.
    const earnings = school.outcomes.medianEarnings10yr ?? 0;
    const room = budget !== undefined && net !== undefined ? Math.max(0, Math.min(1, (budget - net) / budget)) : 0;
    const religiousMismatch = !!school.life.religiousAffiliation && !profile.values.includes("religious-affiliation");
    const score =
      f._sort +
      (grad - MIN_GRAD_RATE) * 4 +
      room * 2 +
      (earnings >= 60_000 ? 1 : 0) +
      (school.underratedFor ? 1 : 0) -
      (religiousMismatch ? 4 : 0);
    return [{ school, tier: read.tier, score, reason: reasonFor(read.tier, net, residency, f.reasons) }];
  });

  // A mix, the way a list is built: the best target, then the best likely,
  // and so on — ranked alone, the cheapest safeties crowd out a strong
  // student's real targets.
  const byScore = (a: { score: number }, b: { score: number }) => b.score - a.score;
  const targets = picks.filter((p) => p.tier === "target").sort(byScore);
  const likelies = picks.filter((p) => p.tier === "likely").sort(byScore);
  const mixed: typeof picks = [];
  while (mixed.length < limit && (targets.length || likelies.length)) {
    const next = (mixed.length % 2 === 0 ? targets : likelies).shift() ?? (targets.shift() ?? likelies.shift())!;
    mixed.push(next);
  }
  return mixed.map(({ school, reason }) => ({ school, reason }));
}

function reasonFor(
  tier: "target" | "likely",
  net: number | undefined,
  residency: ReturnType<typeof residencyAt>,
  fitReasons: string[],
): string {
  const parts = [tier === "likely" ? "A likely admit for you" : "A realistic target for you"];
  if (net !== undefined) {
    const via =
      residency.status === "exchange" && residency.program
        ? ` with ${residency.program.shortName}`
        : residency.status === "in-state"
          ? " in-state"
          : "";
    parts.push(`about $${Math.round(net / 1000)}k a year for you${via}`);
  }
  // The price is already said; the next best thing about it, if there is one.
  const why = fitReasons.find((r) => !/budget|aid/i.test(r));
  if (why) parts.push(why.charAt(0).toLowerCase() + why.slice(1));
  return parts.join(" · ");
}
