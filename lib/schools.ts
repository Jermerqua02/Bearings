/* ————————————————————————————————————————
   Shared school constants.

   Deliberately free of `server-only` and of any database import: the
   explorer's client components need these values too, and a `server-only`
   module can't be imported from the browser half of the app.

   The cycle key is here because two scripts and the query layer all have to
   agree on it. It used to be declared separately in seed.ts and nowhere
   else, which worked only for as long as one script wrote these tables.
   ———————————————————————————————————————— */

import { formatDueDate } from "@/lib/format";
import type {
  ApplicationPlan,
  CampusSetting,
  ChanceTier,
  Region,
  SchoolSize,
  SchoolType,
} from "@/lib/types";

/**
 * The admissions cycle these figures describe.
 *
 * `school_admissions`, `school_cost`, and `school_outcome` are keyed by it,
 * so next year's numbers arrive as new rows rather than a migration and an
 * overwrite. Reads filter on it; writes stamp it.
 */
export const CURRENT_CYCLE = "2026-27";

/** Results per page in the explorer. */
export const PAGE_SIZE = 24;

/**
 * The plans a student can record when we don't know what a school offers.
 *
 * Scorecard publishes no application plans, so 1,545 of the 1,585 schools in
 * the explorer have an empty list — and the plan selector on a student's list
 * was built from that list. It rendered empty, no plan could be chosen, and
 * because the application tracker only shows entries with a plan, Apply
 * stayed permanently empty for anyone whose list wasn't the curated forty.
 *
 * Offering the full set is honest: this field records which plan the *student*
 * is applying under, read off the school's own admissions page. It has never
 * been a claim about what the school offers, and presenting it as one is what
 * made an unknown list mean an unusable one.
 */
export const ALL_APPLICATION_PLANS: ApplicationPlan[] = [
  "ED",
  "ED2",
  "EA",
  "REA",
  "RD",
  "rolling",
];

/** What to show in a plan selector for a given school. */
export function plansFor(school: {
  admissions: { plansOffered: ApplicationPlan[] };
}): { plans: ApplicationPlan[]; known: boolean } {
  const known = school.admissions.plansOffered.length > 0;
  return { plans: known ? school.admissions.plansOffered : ALL_APPLICATION_PLANS, known };
}

/**
 * The plans in words, because the abbreviations are jargon.
 *
 * A student meeting this for the first time has no reason to know that REA
 * is Restrictive Early Action, that ED2 exists, or — the one that actually
 * matters — that Early Decision is a binding commitment to attend. Showing
 * six two-letter codes and expecting the reader to supply the meaning is
 * how a sixteen-year-old signs up for something they didn't understand.
 */
export const planLabel: Record<ApplicationPlan, string> = {
  ED: "Early Decision (binding)",
  ED2: "Early Decision II (binding)",
  EA: "Early Action",
  REA: "Restrictive Early Action",
  RD: "Regular Decision",
  rolling: "Rolling admission",
};

/** The prompt on an unset plan selector. "Plan…" says nothing. */
export const PLAN_PLACEHOLDER = "How you'll apply…";

/**
 * Why a student would pick each one, which is the part that actually
 * decides anything.
 *
 * Naming the plans is not the same as explaining them. "Early Decision
 * (binding)" tells a student what the word means and still leaves them with
 * no way to choose — the real question is what each plan costs and buys.
 * Applying early generally helps your odds; ED helps most and takes away
 * both your right to walk away and your ability to compare aid offers,
 * which for a family that needs aid is the whole decision.
 */
export const planWhy: Record<ApplicationPlan, string> = {
  ED: "Best odds, but you must attend if admitted and can't compare aid offers. Only for a clear first choice you know you can afford.",
  ED2: "Same commitment as ED, later deadline — a second binding shot, often after an ED elsewhere didn't land.",
  EA: "An early answer with no obligation. Little downside; you can still apply elsewhere and compare offers.",
  REA: "Early and non-binding, but limits applying early anywhere else. You keep the choice, you give up other early rounds.",
  RD: "The normal route. Latest deadline, most time to write, and every offer on the table before you decide.",
  rolling: "Decided as they arrive — apply early, since seats and aid go as the year fills.",
};

/** One line under a plan selector, for students meeting this for the first time. */
export const PLAN_HELP =
  "Applying early usually helps your odds. Early Decision helps most and is binding — you commit to attend and give up comparing aid.";

/**
 * A plan as it should read in a selector, with this school's date attached.
 *
 * The deadline is the fact that actually decides between these options — it
 * is what tells a student whether Early Decision means writing the essay in
 * three weeks or three months. We hold per-plan dates for 407 schools and
 * the picker was showing none of them, so the choice was being made against
 * six abstractions.
 *
 * A plan with no known date still appears, unchanged. Absence of a date is
 * not evidence a school doesn't offer the plan — most of these came from
 * Common App's grid, which leaves the cell blank as often as it means no.
 */
export function planOption(
  plan: ApplicationPlan,
  deadlines: Partial<Record<ApplicationPlan, string>>,
): string {
  const due = formatDueDate(deadlines[plan]);
  return due ? `${planLabel[plan]} — due ${due}` : planLabel[plan];
}

/**
 * Whether asking the student which plan they're applying under is a real
 * question for this school, or just a toll gate.
 *
 * Selecting a plan does exactly one thing in this product: it decides which
 * deadline we count down to. It does not enter the student into anything —
 * a binding agreement is made on the college's form, not here. So the
 * control is only worth showing when there is more than one date to choose
 * between, which is true for 317 of 1,944 schools.
 *
 * For the other 1,627 it was pure friction: 90 schools offered a menu with a
 * single item, and 1,537 offered six abstractions that produce no date
 * whichever one you pick. A student reasonably asked what it was for.
 *
 *   choose  — two or more known dates. A genuine question.
 *   single  — one known date. State it; don't make them pick it.
 *   unknown — no dates. Point at the school's page instead.
 */
export type PlanPrompt =
  | { mode: "choose"; dated: ApplicationPlan[]; others: ApplicationPlan[] }
  | { mode: "single"; plan: ApplicationPlan; due: string }
  | { mode: "unknown" };

export function planPrompt(school: {
  admissions: { plansOffered: ApplicationPlan[]; deadlines: Partial<Record<ApplicationPlan, string>> };
}): PlanPrompt {
  const { deadlines } = school.admissions;
  const dated = ALL_APPLICATION_PLANS.filter((p) => formatDueDate(deadlines[p]));

  if (dated.length >= 2) {
    // Plans the school may still offer without a published date stay
    // available, grouped apart — the grid leaves a cell blank as often as it
    // means "no such round".
    const offered = plansFor(school).plans;
    return { mode: "choose", dated, others: offered.filter((p) => !dated.includes(p)) };
  }
  if (dated.length === 1) {
    return { mode: "single", plan: dated[0], due: formatDueDate(deadlines[dated[0]])! };
  }
  return { mode: "unknown" };
}

/* ————————————— Filter vocabulary ————————————— */

/* Ordered reach → likely, matching how a balanced list is described
   everywhere else in the product. */
export const TIERS = [
  { id: "reach", label: "Reach" },
  { id: "target", label: "Target" },
  { id: "likely", label: "Likely" },
] as const;

export const SIZES = [
  { id: "small", label: "Small (<5k)" },
  { id: "medium", label: "Medium (5–15k)" },
  { id: "large", label: "Large (15k+)" },
] as const;

export const SETTINGS = [
  { id: "urban", label: "Urban" },
  { id: "suburban", label: "Suburban" },
  { id: "college-town", label: "College town" },
  { id: "rural", label: "Rural" },
] as const;

export const TYPES = [
  { id: "public-flagship", label: "Public flagship" },
  { id: "public", label: "Public" },
  { id: "private", label: "Private" },
  { id: "lac", label: "Liberal arts" },
  { id: "tech", label: "Tech" },
  { id: "hbcu", label: "HBCU" },
] as const;

export const COST_CAPS = [
  { id: 0, label: "Any net price" },
  { id: 15000, label: "Under $15k / yr" },
  { id: 25000, label: "Under $25k / yr" },
  { id: 35000, label: "Under $35k / yr" },
] as const;

export const SORTS = [
  { id: "fit", label: "Best fit" },
  { id: "selectivity", label: "Most selective" },
  { id: "cost", label: "Lowest net price" },
  { id: "name", label: "A–Z" },
] as const;

export const regionLabel: Record<Region, string> = {
  northeast: "Northeast",
  "mid-atlantic": "Mid-Atlantic",
  south: "South",
  midwest: "Midwest",
  southwest: "Southwest",
  west: "West",
  northwest: "Northwest",
};

/* ————————————— The URL contract ————————————— */

/**
 * The explorer's state lives in the query string.
 *
 * Filtering happens in SQL now — there are far too many schools to send to
 * the browser and sift there — so the filters have to survive a round trip.
 * Putting them in the URL also makes a search shareable, which the old
 * useState version could never be.
 */
export interface ExploreParams {
  tiers: ChanceTier[];
  regions: Region[];
  sizes: SchoolSize[];
  settings: CampusSetting[];
  types: SchoolType[];
  costCap: number;
  testOptionalOnly: boolean;
  q: string;
  sort: SortKey;
  page: number;
}

export type SortKey = (typeof SORTS)[number]["id"];

type Raw = Record<string, string | string[] | undefined>;

/** Comma-separated, tolerating repeated keys, validated against the lists. */
function list<T extends string>(raw: string | string[] | undefined, allowed: readonly T[]): T[] {
  if (!raw) return [];
  const parts = (Array.isArray(raw) ? raw : [raw]).flatMap((v) => v.split(","));
  const ok = new Set<string>(allowed);
  // Unknown values are dropped rather than passed to the database.
  return [...new Set(parts.map((p) => p.trim()).filter((p) => ok.has(p)))] as T[];
}

export function parseExploreParams(raw: Raw): ExploreParams {
  const sortRaw = Array.isArray(raw.sort) ? raw.sort[0] : raw.sort;
  const pageRaw = Number(Array.isArray(raw.page) ? raw.page[0] : raw.page);
  const costRaw = Number(Array.isArray(raw.cost) ? raw.cost[0] : raw.cost);

  return {
    tiers: list(raw.tier, TIERS.map((t) => t.id)),
    regions: list(raw.region, Object.keys(regionLabel) as Region[]),
    sizes: list(raw.size, SIZES.map((s) => s.id)),
    settings: list(raw.setting, SETTINGS.map((s) => s.id)),
    types: list(raw.type, TYPES.map((t) => t.id)),
    costCap: COST_CAPS.some((c) => c.id === costRaw) ? costRaw : 0,
    testOptionalOnly: (Array.isArray(raw.testopt) ? raw.testopt[0] : raw.testopt) === "1",
    q: (Array.isArray(raw.q) ? raw.q[0] : raw.q)?.slice(0, 80) ?? "",
    sort: SORTS.some((s) => s.id === sortRaw) ? (sortRaw as SortKey) : "fit",
    page: Number.isFinite(pageRaw) && pageRaw > 0 ? Math.floor(pageRaw) : 1,
  };
}

/** Back to a query string. Defaults are omitted so clean states get clean URLs. */
export function exploreParamsToQuery(p: Partial<ExploreParams>): string {
  const q = new URLSearchParams();
  if (p.tiers?.length) q.set("tier", p.tiers.join(","));
  if (p.regions?.length) q.set("region", p.regions.join(","));
  if (p.sizes?.length) q.set("size", p.sizes.join(","));
  if (p.settings?.length) q.set("setting", p.settings.join(","));
  if (p.types?.length) q.set("type", p.types.join(","));
  if (p.costCap) q.set("cost", String(p.costCap));
  if (p.testOptionalOnly) q.set("testopt", "1");
  if (p.q?.trim()) q.set("q", p.q.trim());
  if (p.sort && p.sort !== "fit") q.set("sort", p.sort);
  if (p.page && p.page > 1) q.set("page", String(p.page));
  return q.toString();
}

/** How many filters are on, for the mobile filter button's badge. */
export function activeFilterCount(p: ExploreParams): number {
  return (
    p.tiers.length +
    p.regions.length +
    p.sizes.length +
    p.settings.length +
    p.types.length +
    (p.costCap ? 1 : 0) +
    (p.testOptionalOnly ? 1 : 0) +
    (p.q.trim() ? 1 : 0)
  );
}
