/* ————————————————————————————————————————
   School explorer — the server half.

   This page used to hold all forty schools in the browser and filter them
   in a useMemo. That works at forty and doesn't at ~1,900: the array can't
   be shipped, and the chance filter has to run against the database or a
   page comes back short.

   So filtering, sorting and pagination happen in SQL, driven by the query
   string. A side effect worth having: a filtered search is now a URL a
   student can send to a parent.
   ———————————————————————————————————————— */

import Link from "next/link";
import SectionLabel from "@/components/ui/SectionLabel";
import TwoTone from "@/components/ui/TwoTone";
import { getViewer } from "@/lib/auth/policy";
import {
  searchSchools,
} from "@/lib/db/queries/schools";
import { loadProfileOnly } from "@/lib/db/queries/snapshot";
import { chanceRead, fit } from "@/lib/match";
import { counselorPicksFor } from "@/lib/picks";
import { PAGE_SIZE, parseExploreParams } from "@/lib/schools";
import ExploreResults, { type ResultRow } from "./ExploreResults";

export default async function ExplorePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const viewer = await getViewer();
  const profile = viewer ? await loadProfileOnly(viewer) : null;
  const student = profile?.role === "student" ? profile : null;

  if (!student) {
    // A parent lands here too — the layout only redirects them away from
    // /counselor and /interviews — so this has to speak to both.
    const isParent = profile?.role === "parent";
    return (
      <div className="max-w-xl">
        <SectionLabel className="mb-3">Explore</SectionLabel>
        <TwoTone as="h1" size="lg" className="mb-4">
          {isParent ? (
            <>
              <em>The explorer works</em> from your student&apos;s profile.
            </>
          ) : (
            <>
              <em>Set up your profile</em> and this gets personal.
            </>
          )}
        </TwoTone>
        <p className="body-copy">
          {isParent ? (
            <>
              Chances, fit and net price are all calculated against a specific
              student&apos;s grades, budget and preferences — so this page waits
              until yours has finished onboarding. Their list, deadlines and aid
              comparisons are already visible to you on{" "}
              <Link href="/dashboard" className="underline underline-offset-2 text-ink">
                your dashboard
              </Link>
              .
            </>
          ) : (
            <>
              It takes about ten minutes, and everything here — chances, fit,
              what you&apos;d actually pay — becomes specific to you.{" "}
              <Link
                href="/onboarding?role=student"
                className="underline underline-offset-2 text-ink"
              >
                Start onboarding
              </Link>
              .
            </>
          )}
        </p>
      </div>
    );
  }

  const params = parseExploreParams(await searchParams);

  const [result, picks] = await Promise.all([
    searchSchools(student, {
      tiers: params.tiers,
      regions: params.regions,
      sizes: params.sizes,
      settings: params.settings,
      types: params.types,
      costCap: params.costCap,
      testOptionalOnly: params.testOptionalOnly,
      q: params.q,
      sort: params.sort,
      page: params.page,
      perPage: PAGE_SIZE,
    }),
    counselorPicksFor(student),
  ]);

  /* fit() weighs editorial fields the database can't sort on, so it runs
     over the returned page. With sort=fit that orders within the page
     rather than globally — stated in the UI rather than hidden. */
  let rows: ResultRow[] = result.schools.map((school) => ({
    school,
    tier: chanceRead(student, school)?.tier ?? null,
    fitLabel: fit(student, school).label,
  }));
  if (params.sort === "fit") {
    const score = new Map(result.schools.map((s) => [s.id, fit(student, s)._sort]));
    rows = [...rows].sort((a, b) => (score.get(b.school.id) ?? 0) - (score.get(a.school.id) ?? 0));
  }

  return (
    <div className="animate-fade-up">
      <div className="mb-8">
        <SectionLabel className="mb-3">Explore</SectionLabel>
        <TwoTone as="h1" size="lg" className="max-w-3xl">
          <em>
            {result.total.toLocaleString()} school{result.total === 1 ? "" : "s"}
          </em>{" "}
          worth your attention.
        </TwoTone>
      </div>

      <ExploreResults
        params={params}
        rows={rows}
        total={result.total}
        pageCount={result.pageCount}
        picks={picks}
      />
    </div>
  );
}
