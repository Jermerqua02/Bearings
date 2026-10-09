/* ————————————————————————————————————————
   Matching logic: chance tiers, fit, deadlines.
   Deliberately category-based, never a score shown to the user.
   Language rule: "students with your profile", never fake percentages.
   ———————————————————————————————————————— */

import type {
  ApplicationPlan,
  ChanceTier,
  School,
  StudentProfile,
} from "./types";

/* ————— Chance tier ————— */

/**
 * How much the tier is actually worth.
 *
 * A read built from a GPA *and* a test score against a school's own ranges is
 * a different claim from one built on an admit rate alone, and the student
 * deserves to know which they're looking at. "low" is not a hedge for a bad
 * guess — it is the honest label for a real estimate with one input.
 */
export type TierConfidence = "high" | "medium" | "low";

export interface ChanceRead {
  tier: ChanceTier;
  confidence: TierConfidence;
  /** Plain-language note on what the estimate is missing, if anything. */
  caveat?: string;
}

/**
 * Reach / target / likely, plus how much to trust it.
 *
 * Both the student's numbers and the school's can be absent — Scorecard
 * publishes no GPA distribution at all, and a small college may report no
 * test range. Every signal is therefore optional, and the tier is computed
 * from whatever is genuinely available rather than from a filled-in blank.
 */
export function chanceRead(profile: StudentProfile, school: School): ChanceRead | null {
  const { acceptanceRate, gpaMid50, satMid50, actMid50 } = school.admissions;

  // Without an admit rate there is no honest tier to state. Callers show
  // "not enough data" rather than a guess.
  if (acceptanceRate === undefined) return null;

  // Single-digit acceptance rates are a reach for everyone. Full stop.
  if (acceptanceRate < 0.1) {
    return { tier: "reach", confidence: "high" };
  }

  let points = 0;
  let signals = 0;

  const gpa = profile.gpa.unweighted;
  const gpaUsable = gpa !== undefined && gpaMid50 !== undefined;
  if (gpaUsable) {
    signals++;
    if (gpa >= gpaMid50[1]) points += 2;
    else if (gpa >= gpaMid50[0]) points += 1;
    else if (gpa >= gpaMid50[0] - 0.25) points += 0;
    else points -= 1;
  }

  const sat = profile.testScores.sat;
  const act = profile.testScores.act;
  let testUsable = false;
  if (sat !== undefined && satMid50) {
    testUsable = true;
    signals++;
    if (sat >= satMid50[1]) points += 2;
    else if (sat >= satMid50[0]) points += 1;
    else points -= 1;
  } else if (act !== undefined && actMid50) {
    testUsable = true;
    signals++;
    if (act >= actMid50[1]) points += 2;
    else if (act >= actMid50[0]) points += 1;
    else points -= 1;
  }

  // Rigor nudge. Deliberately not a signal: it adjusts the read, it isn't an
  // independent measurement of it, so it must not divide.
  const rigorCount =
    profile.rigor.apCount + profile.rigor.ibCount + profile.rigor.honorsCount;
  if (rigorCount >= 8) points += 1;

  /*
    Nothing to compare against.

    Scorecard publishes no GPA distribution, so all but the hand-written
    forty have no GPA range; and only about 60% publish a test range. A
    student who hasn't tested — which onboarding explicitly calls a normal
    answer — therefore has zero signals against almost every school.

    The old code divided by zero signals, defaulted the average to 0, and
    then asked for `avg >= 0.9` to call anything likely. So "likely" was
    unreachable: a 3.1 student with no test score saw *no likely schools at
    all*, out of 869 that admit three quarters of applicants. A product
    whose first promise is honest expectations was telling exactly the
    students it exists for that they had nothing in reach.

    The school's own selectivity is the honest signal left, and it is a
    real one. A school admitting four of five applicants is a likely school
    for almost anyone; that statement doesn't need the student's numbers,
    and chanceRead marks it low-confidence and says what would sharpen it.
  */
  if (signals === 0) {
    return {
      tier: acceptanceRate >= 0.75 ? "likely" : acceptanceRate >= 0.45 ? "target" : "reach",
      confidence: "low",
      caveat:
        "Based on this school's admit rate alone. Add your GPA or a test score for a sharper read.",
    };
  }

  const avg = points / signals;

  const tier: ChanceTier =
    acceptanceRate < 0.25
      ? // Selective: strong numbers still only make it a target
        avg >= 1.4
        ? "target"
        : "reach"
      : acceptanceRate < 0.5
        ? avg >= 1.4
          ? "likely"
          : avg >= 0.6
            ? "target"
            : "reach"
        : // Open-er admission
          avg >= 0.9
          ? "likely"
          : avg >= 0
            ? "target"
            : "reach";

  // Only two cases remain: both signals, or exactly one. Zero returned above.
  if (gpaUsable && testUsable) return { tier, confidence: "high" };
  return {
    tier,
    confidence: "medium",
    caveat: gpaUsable
      ? "Estimated from your GPA and this school's admit rate — no test range published."
      : "Estimated from your test score and this school's admit rate — no GPA range published.",
  };
}

/**
 * The tier on its own.
 *
 * Kept because most callers only need the badge. Schools with no admit rate
 * fall back to "target" — the neutral middle — and callers that care about
 * the difference should use chanceRead() and check for null.
 */
export function chanceTier(profile: StudentProfile, school: School): ChanceTier {
  return chanceRead(profile, school)?.tier ?? "target";
}

/* ————— Fit (categorical, with reasons) ————— */

export type FitLabel = "Strong fit" | "Good fit" | "Worth a look";

export interface Fit {
  label: FitLabel;
  reasons: string[];
  /* internal only — used for sorting, never displayed as a number */
  _sort: number;
}

/**
 * `netPrice` is what this student would pay on average, when the caller
 * knows better than the school's published (in-state) figure — the server
 * adjusts it for where they live (lib/residency.ts, which can't load here).
 */
export function fit(profile: StudentProfile, school: School, netPrice = school.cost.avgNetPrice): Fit {
  let score = 0;
  const reasons: string[] = [];

  if (profile.geography.regions.includes(school.region)) {
    score += 2;
    reasons.push("In a region you'd consider");
  }
  if (profile.campus.settings.includes(school.setting)) {
    score += 2;
    reasons.push(`${settingLabel(school.setting)} setting, like you wanted`);
  }
  if (profile.campus.sizes.includes(school.size)) {
    score += 1;
  }

  const budget = profile.budget.maxPerYear;
  // A school that reported no net price is neither in budget nor over it.
  // Scoring it as 0 rather than -2 keeps "we don't know" from reading as
  // "too expensive" — the old code would have treated a missing figure as
  // free, which is the same mistake in the opposite direction.
  if (budget !== undefined && netPrice !== undefined) {
    if (netPrice <= budget) {
      score += 3;
      reasons.push("Average net price fits your budget");
    } else if (netPrice <= budget + 8000) {
      score += 1;
      reasons.push("Close to budget — aid could bridge the gap");
    } else if (school.cost.meritAid === "generous") {
      score += 1;
      reasons.push("Over budget on average, but merit aid is generous here");
    } else {
      score -= 2;
    }
  }

  if (!profile.undecided && profile.intendedMajors.length > 0) {
    const majorHit = profile.intendedMajors.some((m) =>
      school.academics.topMajors.some(
        (t) =>
          t.toLowerCase().includes(m.toLowerCase().split(" ")[0]) ||
          m.toLowerCase().includes(t.toLowerCase().split(" ")[0])
      )
    );
    if (majorHit) {
      score += 2;
      reasons.push(`Strong in ${profile.intendedMajors[0]}`);
    }
  } else {
    // Undecided students benefit from flexible, broad schools
    if (school.type === "lac" || school.type === "public-flagship") {
      score += 1;
      reasons.push("Easy to explore majors here");
    }
  }

  for (const v of profile.values) {
    switch (v) {
      case "research-access":
        if (school.academics.researchOpportunities) {
          score += 1;
          reasons.push("Real research access");
        }
        break;
      case "co-op-internships":
        if (school.academics.coOp) {
          score += 1;
          reasons.push("Co-op / internship pipeline");
        }
        break;
      case "d1-sports":
        if (school.life.d1Athletics) score += 1;
        break;
      case "greek-life":
        if (school.life.greekLifePresence !== "none") score += 1;
        break;
      case "religious-affiliation":
        if (school.life.religiousAffiliation) score += 1;
        break;
      default:
        break;
    }
  }

  const label: FitLabel =
    score >= 7 ? "Strong fit" : score >= 4 ? "Good fit" : "Worth a look";
  return { label, reasons: reasons.slice(0, 3), _sort: score };
}

function settingLabel(s: School["setting"]): string {
  return s === "college-town"
    ? "College-town"
    : s.charAt(0).toUpperCase() + s.slice(1);
}

/* ————— Counselor picks ————— */

export function counselorPicks(
  profile: StudentProfile,
  schools: School[],
  excludeIds: Set<string>
): { school: School; reason: string }[] {
  return schools
    .filter((s) => s.underratedFor && !excludeIds.has(s.id))
    .map((s) => ({ school: s, f: fit(profile, s) }))
    .sort((a, b) => b.f._sort - a.f._sort)
    .slice(0, 4)
    .map(({ school }) => ({ school, reason: school.underratedFor! }));
}

/* ————— Deadlines ————— */

export interface DeadlineInfo {
  plan: ApplicationPlan;
  date: Date;
  iso: string;
}

export function nextDeadline(
  school: School,
  preferredPlan?: ApplicationPlan,
  from = new Date()
): DeadlineInfo | null {
  const entries = Object.entries(school.admissions.deadlines) as [
    ApplicationPlan,
    string,
  ][];
  if (preferredPlan) {
    const hit = entries.find(([p]) => p === preferredPlan);
    if (hit) return { plan: hit[0], date: new Date(hit[1]), iso: hit[1] };
  }
  const upcoming = entries
    .map(([p, iso]) => ({ plan: p, date: new Date(iso), iso }))
    .filter((d) => d.date.getTime() >= from.getTime())
    .sort((a, b) => a.date.getTime() - b.date.getTime());
  return upcoming[0] ?? null;
}

export function daysUntil(date: Date, from = new Date()): number {
  return Math.ceil((date.getTime() - from.getTime()) / 86400000);
}

export function formatDeadline(d: DeadlineInfo): string {
  return `${d.plan} · ${d.date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  })}`;
}

/* ————— List balance ————— */

export interface BalanceRead {
  reach: number;
  target: number;
  likely: number;
  message: string;
  healthy: boolean;
}

export function listBalance(
  counts: Record<ChanceTier, number>
): BalanceRead {
  const { reach, target, likely } = counts;
  const total = reach + target + likely;
  let message: string;
  let healthy = false;

  if (total === 0) {
    message = "Nothing here yet — let's start exploring.";
  } else if (likely === 0) {
    message = `${reach} reach${reach === 1 ? "" : "es"}, ${target} target${target === 1 ? "" : "s"}, no likelies — every strong list needs a foundation. Let's find likely schools you'd genuinely be excited about.`;
  } else if (reach > likely + target) {
    message = `${reach} reaches against ${target + likely} others — that's top-heavy. Ambition is good; balance is what protects it.`;
  } else if (total < 4) {
    message = "A good start. Most balanced lists end up with 7–10 schools.";
  } else {
    message = "This is a healthy shape — a real foundation with room to dream.";
    healthy = true;
  }
  return { reach, target, likely, message, healthy };
}
