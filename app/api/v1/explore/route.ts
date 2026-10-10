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
import { searchSchools } from "@/lib/db/queries/schools";
import { subjectProfile } from "@/lib/db/queries/snapshot";
import { chanceRead, fit } from "@/lib/match";
import { counselorPicksFor } from "@/lib/picks";
import { isPro, proStatus } from "@/lib/entitlements";
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
  // Chances, fit and net price are all relative to a student: the viewer,
  // or a parent's linked student (lib/db/queries/snapshot.ts). Anyone who
  // hasn't onboarded gets the reason instead of a list.
  const subject = await subjectProfile(viewer);
  if (!subject) {
    return { needsProfile: true, isParent: viewer.role === "parent", options: OPTIONS };
  }
  const profile = subject.profile;
  // An unlinked parent has no grades behind a chance read, so they get
  // published numbers and their own price — no tiers, fit or picks.
  const personal = subject.linked;
  // Lets the app say whose chances these are: "Maya: target".
  const who = { name: subject.name, linked: subject.linked, isParent: subject.isParent };

  const raw = Object.fromEntries(new URL(request.url).searchParams.entries());
  const params = parseExploreParams(raw);

  // Free is the public directory: what a college's own site would say.
  // Everything relative to this student — chances, fit, their price,
  // picks, and the sort and filter built on them — is Pro, and isn't even
  // computed for a Free account, so no client can show it.
  const pro = isPro(await proStatus(viewer.userId, viewer.role));
  if (!pro || !personal) {
    if (params.sort === "fit") params.sort = "name";
    params.tiers = [];
  }

  const [result, picks, everything] = await Promise.all([
    // Free browses the 40 hand-written schools; Pro, all of them.
    searchSchools(profile, { ...params, perPage: PAGE_SIZE, curatedOnly: !pro }),
    // Picks are only shown on an unfiltered first page, so skip the query otherwise.
    pro && personal && params.page === 1 ? counselorPicksFor(profile) : Promise.resolve([]),
    // What Pro would open, for the Free note: the whole directory.
    pro ? Promise.resolve(null) : searchSchools(profile, { perPage: 1 }),
  ]);

  if (!pro) {
    return {
      needsProfile: false,
      locked: true,
      subject: who,
      // How many schools Pro opens, for "Free shows 40 of 1,587".
      fullTotal: everything?.total ?? null,
      total: result.total,
      page: result.page,
      pageCount: result.pageCount,
      // fitLabel "" rather than null: builds before Pro decode it as a string.
      rows: result.schools.map((school) => ({ school, tier: null, fitLabel: "", netForYou: null, residency: null })),
      picks: [],
      // "Best fit" and the chance filter are built on them: Pro.
      options: { ...OPTIONS, sorts: OPTIONS.sorts.filter((s) => s.id !== "fit"), tiers: [] },
    };
  }

  let rows = result.schools.map((school) => {
    // The average net price is in-state at a public school; this is theirs,
    // and it's what their budget is weighed against.
    const residency = residencyAt(school, profile.homeState);
    const netForYou = adjustForResidency(school.cost.avgNetPrice, residency);
    const f = fit(profile, school, netForYou);
    return {
      school,
      tier: personal ? (chanceRead(profile, school)?.tier ?? null) : null,
      fitLabel: personal ? f.label : "",
      netForYou: netForYou ?? null,
      residency: residency.status,
      _sort: f._sort,
    };
  });
  // fit() weighs fields SQL can't sort on, so "Best fit" orders within the page.
  if (params.sort === "fit") rows = [...rows].sort((a, b) => b._sort - a._sort);

  return {
    needsProfile: false,
    locked: false,
    subject: who,
    total: result.total,
    page: result.page,
    pageCount: result.pageCount,
    rows: rows.map(({ _sort, ...r }) => r),
    // Picks are written to the student ("a likely admit for you"); to their
    // parent they name the student instead.
    picks: subject.isParent ? picks.map((p) => ({ ...p, reason: aboutStudent(p.reason, subject.name) })) : picks,
    options: personal ? OPTIONS : { ...OPTIONS, sorts: OPTIONS.sorts.filter((s) => s.id !== "fit"), tiers: [] },
  };
});

/** "A likely admit for you · in a region you'd consider" → "… for Riley · … Riley would consider". */
function aboutStudent(text: string, name: string): string {
  return text
    .replace(/\bfor you\b/g, `for ${name}`)
    .replace(/\byou'd\b/g, `${name} would`)
    .replace(/\byou wanted\b/g, `${name} wanted`)
    .replace(/\byour\b/g, `${name}'s`);
}
