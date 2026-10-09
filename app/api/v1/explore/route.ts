/* ————————————————————————————————————————
   GET /api/v1/explore?tier=&region=&size=&setting=&type=&cost=&testopt=&q=&sort=&page=

   The explorer, over the same query-string contract as /explore — so a
   search built on the phone is the same search on the web. Filtering,
   the chance tier and pagination run in SQL (searchSchools); fit and the
   counselor picks run here, exactly as the page does it.

   The filter vocabulary comes back with every response, so the app never
   holds its own copy of the labels.
   ———————————————————————————————————————— */

import { requireViewer } from "@/lib/auth/policy";
import { getCounselorPickCandidates, searchSchools } from "@/lib/db/queries/schools";
import { loadProfileOnly } from "@/lib/db/queries/snapshot";
import { chanceRead, counselorPicks, fit } from "@/lib/match";
import {
  COST_CAPS,
  PAGE_SIZE,
  SETTINGS,
  SIZES,
  SORTS,
  TIERS,
  TYPES,
  parseExploreParams,
  regionLabel,
} from "@/lib/schools";
import { route } from "@/lib/api/v1";
import { adjustForResidency, residencyAt } from "@/lib/residency";

export const runtime = "nodejs";

const OPTIONS = {
  tiers: TIERS,
  regions: Object.entries(regionLabel).map(([id, label]) => ({ id, label })),
  sizes: SIZES,
  settings: SETTINGS,
  types: TYPES,
  costCaps: COST_CAPS,
  sorts: SORTS,
};

export const GET = route("explore", "We couldn't load schools just now.", async (request) => {
  const viewer = await requireViewer();
  const profile = await loadProfileOnly(viewer);
  // Chances, fit and net price are all relative to a student. A parent, or
  // a student who hasn't onboarded, gets the reason instead of a list.
  if (profile?.role !== "student") {
    return { needsProfile: true, isParent: viewer.role === "parent", options: OPTIONS };
  }

  const raw = Object.fromEntries(new URL(request.url).searchParams.entries());
  const params = parseExploreParams(raw);

  const [result, pickCandidates] = await Promise.all([
    searchSchools(profile, { ...params, perPage: PAGE_SIZE }),
    // Picks are only shown on an unfiltered first page, so skip the query otherwise.
    params.page === 1 ? getCounselorPickCandidates(12) : Promise.resolve([]),
  ]);

  let rows = result.schools.map((school) => {
    // The average net price is in-state at a public school; this is theirs,
    // and it's what their budget is weighed against.
    const residency = residencyAt(school, profile.homeState);
    const netForYou = adjustForResidency(school.cost.avgNetPrice, residency);
    const f = fit(profile, school, netForYou);
    return {
      school,
      tier: chanceRead(profile, school)?.tier ?? null,
      fitLabel: f.label,
      netForYou: netForYou ?? null,
      residency: residency.status,
      _sort: f._sort,
    };
  });
  // fit() weighs fields SQL can't sort on, so "Best fit" orders within the page.
  if (params.sort === "fit") rows = [...rows].sort((a, b) => b._sort - a._sort);

  return {
    needsProfile: false,
    total: result.total,
    page: result.page,
    pageCount: result.pageCount,
    rows: rows.map(({ _sort, ...r }) => r),
    picks: counselorPicks(profile, pickCandidates, new Set()).slice(0, 4),
    options: OPTIONS,
  };
});
