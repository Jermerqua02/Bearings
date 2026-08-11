"use client";

/* ————————————————————————————————————————
   The explorer's interactive half.

   Filtering moved to the server, so the chips write to the URL instead of
   to useState. The trap in that change is latency: a chip that waits on a
   round trip before it highlights feels broken, and the old version was
   instant. So selections are held locally, applied on the same frame as the
   tap, and the results fade while the new page loads.
   ———————————————————————————————————————— */

import { useCallback, useMemo, useOptimistic, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import SchoolCard from "@/components/school/SchoolCard";
import Button from "@/components/ui/Button";
import Chip from "@/components/ui/Chip";
import SectionLabel from "@/components/ui/SectionLabel";
import TierBadge from "@/components/ui/TierBadge";
import { formatRate, formatThousands } from "@/lib/format";
import {
  activeFilterCount,
  COST_CAPS,
  exploreParamsToQuery,
  regionLabel,
  SETTINGS,
  SIZES,
  SORTS,
  TIERS,
  TYPES,
  type ExploreParams,
  type SortKey,
} from "@/lib/schools";
import { useApp } from "@/lib/profile-context";
import type { FitLabel } from "@/lib/match";
import type {
  CampusSetting,
  ChanceTier,
  Region,
  School,
  SchoolSize,
  SchoolType,
} from "@/lib/types";

export interface ResultRow {
  school: School;
  tier: ChanceTier | null;
  fitLabel: FitLabel;
}

type View = "grid" | "list" | "map";

export default function ExploreResults({
  params,
  rows,
  total,
  pageCount,
  picks,
}: {
  params: ExploreParams;
  rows: ResultRow[];
  total: number;
  pageCount: number;
  picks: { school: School; reason: string }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const { list, addToList, removeFromList } = useApp();
  const [view, setView] = useState<View>("grid");
  const [filtersOpen, setFiltersOpen] = useState(false);

  /* The chips read from here, so a tap paints immediately and the server
     result replaces it when it arrives. */
  const [shown, setShown] = useOptimistic(params);

  const listIds = useMemo(() => new Set(list.map((e) => e.schoolId)), [list]);

  const apply = useCallback(
    (patch: Partial<ExploreParams>) => {
      // Any filter change resets to page 1 — staying on page 7 of a result
      // set that just shrank to two pages shows nothing.
      const next = { ...shown, ...patch, page: patch.page ?? 1 };
      startTransition(() => {
        setShown(next);
        const qs = exploreParamsToQuery(next);
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
      });
    },
    [shown, pathname, router, setShown],
  );

  const toggleIn = <T extends string>(current: T[], id: T): T[] =>
    current.includes(id) ? current.filter((x) => x !== id) : [...current, id];

  const toggleList = (school: School, tier: ChanceTier | null) => {
    if (listIds.has(school.id)) removeFromList(school.id);
    else
      addToList({
        schoolId: school.id,
        // The badge beside this button came from the server's calculation;
        // recomputing here risks saving a tier that disagrees with it.
        tier: tier ?? "target",
        status: "considering",
      });
  };

  const filterCount = activeFilterCount(shown);

  const filterRail = (
    <div className="space-y-6">
      <div>
        <SectionLabel className="mb-2">Your chances</SectionLabel>
        <div className="flex flex-wrap gap-1.5">
          {TIERS.map((t) => (
            <Chip
              key={t.id}
              active={shown.tiers.includes(t.id)}
              onClick={() => apply({ tiers: toggleIn(shown.tiers, t.id) })}
              className="!min-h-[36px] !text-[0.82rem]"
            >
              {t.label}
            </Chip>
          ))}
        </div>
        <p className="text-[0.72rem] text-gray-mid mt-2 leading-snug">
          Estimated from your grades and scores against each school&apos;s range.
        </p>
      </div>
      <div>
        <SectionLabel className="mb-2">Region</SectionLabel>
        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(regionLabel) as Region[]).map((r) => (
            <Chip
              key={r}
              active={shown.regions.includes(r)}
              onClick={() => apply({ regions: toggleIn(shown.regions, r) })}
              className="!min-h-[36px] !text-[0.82rem]"
            >
              {regionLabel[r]}
            </Chip>
          ))}
        </div>
      </div>
      <div>
        <SectionLabel className="mb-2">Size</SectionLabel>
        <div className="flex flex-wrap gap-1.5">
          {SIZES.map((s) => (
            <Chip
              key={s.id}
              active={shown.sizes.includes(s.id)}
              onClick={() => apply({ sizes: toggleIn(shown.sizes, s.id as SchoolSize) })}
              className="!min-h-[36px] !text-[0.82rem]"
            >
              {s.label}
            </Chip>
          ))}
        </div>
      </div>
      <div>
        <SectionLabel className="mb-2">Setting</SectionLabel>
        <div className="flex flex-wrap gap-1.5">
          {SETTINGS.map((s) => (
            <Chip
              key={s.id}
              active={shown.settings.includes(s.id)}
              onClick={() => apply({ settings: toggleIn(shown.settings, s.id as CampusSetting) })}
              className="!min-h-[36px] !text-[0.82rem]"
            >
              {s.label}
            </Chip>
          ))}
        </div>
      </div>
      <div>
        <SectionLabel className="mb-2">Type</SectionLabel>
        <div className="flex flex-wrap gap-1.5">
          {TYPES.map((t) => (
            <Chip
              key={t.id}
              active={shown.types.includes(t.id)}
              onClick={() => apply({ types: toggleIn(shown.types, t.id as SchoolType) })}
              className="!min-h-[36px] !text-[0.82rem]"
            >
              {t.label}
            </Chip>
          ))}
        </div>
      </div>
      <div>
        <SectionLabel className="mb-2">Cost after aid</SectionLabel>
        <div className="flex flex-wrap gap-1.5">
          {COST_CAPS.map((c) => (
            <Chip
              key={c.id}
              active={shown.costCap === c.id}
              onClick={() => apply({ costCap: c.id })}
              className="!min-h-[36px] !text-[0.82rem]"
            >
              {c.label}
            </Chip>
          ))}
        </div>
        <p className="text-[0.75rem] text-gray-mid mt-2">
          Net price = what families actually pay, on average. Always our default.
        </p>
      </div>
      <div>
        <SectionLabel className="mb-2">Testing</SectionLabel>
        <Chip
          active={shown.testOptionalOnly}
          onClick={() => apply({ testOptionalOnly: !shown.testOptionalOnly })}
          className="!min-h-[36px] !text-[0.82rem]"
        >
          Test-optional or blind only
        </Chip>
      </div>
      {filterCount > 0 && (
        <button
          onClick={() =>
            apply({
              tiers: [],
              regions: [],
              sizes: [],
              settings: [],
              types: [],
              costCap: 0,
              testOptionalOnly: false,
              q: "",
            })
          }
          className="text-[0.82rem] text-ink underline underline-offset-4 min-h-[38px]"
        >
          Clear all filters
        </button>
      )}
    </div>
  );

  return (
    <>
      {/* Counselor picks — not filtered, so they stay useful when a search
          comes back empty. */}
      {picks.length > 0 && (
        <section aria-label="Counselor picks" className="mb-10">
          <div className="flex items-baseline justify-between mb-3">
            <SectionLabel>Counselor picks — underrated for you</SectionLabel>
          </div>
          <div className="flex gap-4 overflow-x-auto no-scrollbar pb-1">
            {picks.map(({ school, reason }, i) => (
              <Link
                key={school.id}
                href={`/explore/${school.id}`}
                className="shrink-0 w-72 border border-hairline bg-surface rounded-[3px] p-5 hover:border-ink transition-quiet"
              >
                <span className="card-index">{String(i + 1).padStart(2, "0")}</span>
                <p className="font-semibold mt-2 mb-1">{school.name}</p>
                <p className="text-[0.85rem] text-gray-strong leading-relaxed">{reason}</p>
              </Link>
            ))}
          </div>
        </section>
      )}

      <div className="flex gap-8">
        <aside className="hidden md:block w-60 shrink-0" aria-label="Filters">
          {filterRail}
        </aside>

        <div className="flex-1 min-w-0">
          {/* Toolbar */}
          <div className="flex items-center justify-between gap-3 mb-5">
            <button
              onClick={() => setFiltersOpen(true)}
              className="md:hidden border border-hairline rounded-full px-4 h-10 text-[0.8rem] uppercase tracking-[0.08em]"
            >
              Filters{filterCount ? ` · ${filterCount}` : ""}
            </button>
            <label className="flex-1 max-w-xs">
              <span className="sr-only">Search schools by name or city</span>
              <input
                type="search"
                defaultValue={shown.q}
                placeholder="Search by name or city"
                onChange={(e) => {
                  const v = e.target.value;
                  // Wait for a pause before routing — one request per
                  // keystroke over ~1,900 rows is pure waste.
                  clearTimeout((window as unknown as { __t?: number }).__t);
                  (window as unknown as { __t?: number }).__t = window.setTimeout(
                    () => apply({ q: v }),
                    350,
                  ) as unknown as number;
                }}
                className="w-full border border-hairline rounded-[3px] bg-surface px-3 h-9 text-[0.85rem] outline-none focus:border-ink"
              />
            </label>
            <div className="flex items-center gap-2">
              <label htmlFor="sort" className="label-caps hidden sm:block">
                Sort
              </label>
              <select
                id="sort"
                value={shown.sort}
                onChange={(e) => apply({ sort: e.target.value as SortKey })}
                className="border border-hairline rounded-[3px] bg-surface px-2 h-9 text-[0.85rem] outline-none focus:border-ink"
              >
                {SORTS.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
              <div className="hidden sm:flex border border-hairline rounded-[3px] overflow-hidden">
                {(["grid", "list", "map"] as View[]).map((v) => (
                  <button
                    key={v}
                    onClick={() => setView(v)}
                    aria-pressed={view === v}
                    className={`px-3 h-9 text-[0.78rem] uppercase tracking-[0.06em] transition-quiet ${
                      view === v ? "bg-ink text-white" : "text-gray-strong hover:text-ink"
                    }`}
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className={pending ? "opacity-50 transition-opacity" : "transition-opacity"}>
            {view === "map" ? (
              <div className="border border-hairline rounded-[3px] bg-surface p-10 text-center">
                <p className="body-copy mx-auto">
                  Map view is coming — for now, the grid shows distance-relevant
                  info on each card.
                </p>
              </div>
            ) : rows.length === 0 ? (
              /* The state that started all this: filtering to nothing used to
                 render an empty grid under "0 schools worth your attention." */
              <div className="border border-hairline rounded-[3px] bg-surface p-8 md:p-10 max-w-xl">
                <p className="text-[1.05rem] font-medium mb-2">
                  No schools match all of those at once.
                </p>
                <p className="body-copy mb-5">
                  {filterCount > 0
                    ? "That combination is narrower than the data supports. Loosening the price cap or adding a second region usually opens it back up."
                    : "There are no schools in the database yet — run the importer to populate it."}
                </p>
                {filterCount > 0 && (
                  <Button
                    variant="primary"
                    onClick={() =>
                      apply({
                        tiers: [],
                        regions: [],
                        sizes: [],
                        settings: [],
                        types: [],
                        costCap: 0,
                        testOptionalOnly: false,
                        q: "",
                      })
                    }
                  >
                    Clear all filters
                  </Button>
                )}
              </div>
            ) : view === "grid" ? (
              <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
                {rows.map(({ school, tier, fitLabel }, i) => (
                  <SchoolCard
                    key={school.id}
                    school={school}
                    tier={tier ?? "target"}
                    fitLabel={fitLabel}
                    index={(shown.page - 1) * rows.length + i}
                    onList={listIds.has(school.id)}
                    onToggleList={() => toggleList(school, tier)}
                  />
                ))}
              </div>
            ) : (
              <ul className="divide-y divide-hairline border border-hairline rounded-[3px] bg-surface">
                {rows.map(({ school, tier, fitLabel }) => (
                  <li key={school.id} className="flex items-center gap-4 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/explore/${school.id}`}
                        className="font-medium hover:underline underline-offset-2"
                      >
                        {school.name}
                      </Link>
                      <p className="text-[0.8rem] text-gray-mid">
                        {[
                          `${school.city}, ${school.state}`,
                          school.cost.avgNetPrice != null &&
                            `~${formatThousands(school.cost.avgNetPrice)} net`,
                          school.admissions.acceptanceRate != null &&
                            `${formatRate(school.admissions.acceptanceRate)} admit`,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                    <span className="hidden sm:block text-[0.82rem] text-accent font-medium">
                      {fitLabel}
                    </span>
                    {tier && <TierBadge tier={tier} />}
                    <button
                      onClick={() => toggleList(school, tier)}
                      aria-pressed={listIds.has(school.id)}
                      aria-label={
                        listIds.has(school.id)
                          ? `Remove ${school.name} from your list`
                          : `Add ${school.name} to your list`
                      }
                      className="text-[0.72rem] uppercase tracking-[0.08em] font-medium text-ink hover:text-accent whitespace-nowrap min-h-[38px] px-1"
                    >
                      {listIds.has(school.id) ? "✓" : "+ List"}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Pagination */}
          {pageCount > 1 && view !== "map" && (
            <nav
              aria-label="Pages"
              className="flex items-center justify-between gap-4 mt-8 pt-5 border-t border-hairline"
            >
              <button
                onClick={() => apply({ page: shown.page - 1 })}
                disabled={shown.page <= 1}
                className="text-[0.85rem] text-ink underline underline-offset-4 disabled:text-gray-mid disabled:no-underline min-h-[38px]"
              >
                ← Previous
              </button>
              <span className="text-[0.85rem] text-gray-strong">
                Page {shown.page} of {pageCount} · {total.toLocaleString()} schools
              </span>
              <button
                onClick={() => apply({ page: shown.page + 1 })}
                disabled={shown.page >= pageCount}
                className="text-[0.85rem] text-ink underline underline-offset-4 disabled:text-gray-mid disabled:no-underline min-h-[38px]"
              >
                Next →
              </button>
            </nav>
          )}
        </div>
      </div>

      {/* Mobile filter sheet */}
      {filtersOpen && (
        <div className="md:hidden fixed inset-0 z-50">
          <button
            aria-label="Close filters"
            onClick={() => setFiltersOpen(false)}
            className="absolute inset-0 bg-ink/30"
          />
          <div className="absolute bottom-0 inset-x-0 bg-paper rounded-t-lg border-t border-hairline max-h-[80vh] overflow-y-auto p-5 pb-8">
            <div className="flex items-center justify-between mb-5">
              <SectionLabel>Filters</SectionLabel>
              <button
                onClick={() => setFiltersOpen(false)}
                className="text-[0.85rem] text-ink underline underline-offset-4 min-h-[38px] px-2"
              >
                Done
              </button>
            </div>
            {filterRail}
          </div>
        </div>
      )}
    </>
  );
}
