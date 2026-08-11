/* ————————————————————————————————————————
   Shared school constants.

   Deliberately free of `server-only` and of any database import: the
   explorer's client components need these values too, and a `server-only`
   module can't be imported from the browser half of the app.

   The cycle key is here because two scripts and the query layer all have to
   agree on it. It used to be declared separately in seed.ts and nowhere
   else, which worked only for as long as one script wrote these tables.
   ———————————————————————————————————————— */

import type {
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
