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

export function chanceTier(profile: StudentProfile, school: School): ChanceTier {
  const { acceptanceRate, gpaMid50, satMid50, actMid50 } = school.admissions;

  // Single-digit acceptance rates are a reach for everyone. Full stop.
  if (acceptanceRate < 0.1) return "reach";

  let points = 0;
  let signals = 0;

  const gpa = profile.gpa.unweighted;
  if (gpa !== undefined) {
    signals++;
    if (gpa >= gpaMid50[1]) points += 2;
    else if (gpa >= gpaMid50[0]) points += 1;
    else if (gpa >= gpaMid50[0] - 0.25) points += 0;
    else points -= 1;
  }

  const sat = profile.testScores.sat;
  const act = profile.testScores.act;
  if (sat !== undefined && satMid50) {
    signals++;
    if (sat >= satMid50[1]) points += 2;
    else if (sat >= satMid50[0]) points += 1;
    else points -= 1;
  } else if (act !== undefined && actMid50) {
    signals++;
    if (act >= actMid50[1]) points += 2;
    else if (act >= actMid50[0]) points += 1;
    else points -= 1;
  }

  // Rigor nudge
  const rigorCount =
    profile.rigor.apCount + profile.rigor.ibCount + profile.rigor.honorsCount;
  if (rigorCount >= 8) points += 1;

  const avg = signals > 0 ? points / signals : 0;

  if (acceptanceRate < 0.25) {
    // Selective: strong numbers still only make it a target
    return avg >= 1.4 ? "target" : "reach";
  }
  if (acceptanceRate < 0.5) {
    if (avg >= 1.4) return "likely";
    if (avg >= 0.6) return "target";
    return "reach";
  }
  // Open-er admission
  if (avg >= 0.9) return "likely";
  if (avg >= 0) return "target";
  return "reach";
}

/* ————— Fit (categorical, with reasons) ————— */

export type FitLabel = "Strong fit" | "Good fit" | "Worth a look";

export interface Fit {
  label: FitLabel;
  reasons: string[];
  /* internal only — used for sorting, never displayed as a number */
  _sort: number;
}

export function fit(profile: StudentProfile, school: School): Fit {
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
  if (budget !== undefined) {
    if (school.cost.avgNetPrice <= budget) {
      score += 3;
      reasons.push("Average net price fits your budget");
    } else if (school.cost.avgNetPrice <= budget + 8000) {
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
