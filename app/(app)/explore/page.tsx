"use client";

/* School explorer — browse, filter, sort. Counselor Picks row on top:
   great schools this student has never heard of, each with a reason. */

import { useMemo, useState } from "react";
import Link from "next/link";
import SchoolCard from "@/components/school/SchoolCard";
import Chip from "@/components/ui/Chip";
import SectionLabel from "@/components/ui/SectionLabel";
import TierBadge from "@/components/ui/TierBadge";
import TwoTone from "@/components/ui/TwoTone";
import { schools, regionLabel } from "@/lib/data/schools";
import { chanceTier, counselorPicks, fit } from "@/lib/match";
import { useApp } from "@/lib/profile-context";
import type { Region, School } from "@/lib/types";

type SortKey = "fit" | "selectivity" | "cost" | "name";
type View = "grid" | "list" | "map";

/* Ordered reach → likely, matching how a balanced list is described
   everywhere else in the product. */
const TIERS = [
  { id: "reach", label: "Reach" },
  { id: "target", label: "Target" },
  { id: "likely", label: "Likely" },
] as const;

const SIZES = [
  { id: "small", label: "Small (<5k)" },
  { id: "medium", label: "Medium (5–15k)" },
  { id: "large", label: "Large (15k+)" },
] as const;

const SETTINGS = [
  { id: "urban", label: "Urban" },
  { id: "suburban", label: "Suburban" },
  { id: "college-town", label: "College town" },
  { id: "rural", label: "Rural" },
] as const;

const TYPES = [
  { id: "public-flagship", label: "Public flagship" },
  { id: "public", label: "Public" },
  { id: "private", label: "Private" },
  { id: "lac", label: "Liberal arts" },
  { id: "tech", label: "Tech" },
  { id: "hbcu", label: "HBCU" },
] as const;

const COST_CAPS = [
  { id: 0, label: "Any net price" },
  { id: 15000, label: "Under $15k / yr" },
  { id: 25000, label: "Under $25k / yr" },
  { id: 35000, label: "Under $35k / yr" },
] as const;

export default function ExplorePage() {
  const { profile, list, addToList, removeFromList } = useApp();
  const student = profile?.role === "student" ? profile : null;

  const [regions, setRegions] = useState<Region[]>([]);
  const [tiers, setTiers] = useState<string[]>([]);
  const [sizes, setSizes] = useState<string[]>([]);
  const [settings, setSettings] = useState<string[]>([]);
  const [types, setTypes] = useState<string[]>([]);
  const [costCap, setCostCap] = useState(0);
  const [testOptionalOnly, setTestOptionalOnly] = useState(false);
  const [sort, setSort] = useState<SortKey>("fit");
  const [view, setView] = useState<View>("grid");
  const [filtersOpen, setFiltersOpen] = useState(false);

  const listIds = useMemo(() => new Set(list.map((e) => e.schoolId)), [list]);

  const toggle = (arr: string[], set: (v: string[]) => void, id: string) =>
    set(arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id]);

  const enriched = useMemo(() => {
    if (!student) return [];
    return schools.map((s) => ({
      school: s,
      tier: chanceTier(student, s),
      f: fit(student, s),
    }));
  }, [student]);

  const filtered = useMemo(() => {
    let out = enriched.filter(({ school: s, tier }) => {
      // Chance is the question most students are actually asking, so it
      // filters alongside region and size rather than living in the sort.
      if (tiers.length && !tiers.includes(tier)) return false;
      if (regions.length && !regions.includes(s.region)) return false;
      if (sizes.length && !sizes.includes(s.size)) return false;
      if (settings.length && !settings.includes(s.setting)) return false;
      if (types.length && !types.includes(s.type)) return false;
      if (costCap && s.cost.avgNetPrice > costCap) return false;
      if (testOptionalOnly && s.admissions.testPolicy === "required")
        return false;
      return true;
    });
    switch (sort) {
      case "fit":
        out = [...out].sort((a, b) => b.f._sort - a.f._sort);
        break;
      case "selectivity":
        out = [...out].sort(
          (a, b) => a.school.admissions.acceptanceRate - b.school.admissions.acceptanceRate
        );
        break;
      case "cost":
        out = [...out].sort(
          (a, b) => a.school.cost.avgNetPrice - b.school.cost.avgNetPrice
        );
        break;
      case "name":
        out = [...out].sort((a, b) => a.school.name.localeCompare(b.school.name));
        break;
    }
    return out;
  }, [enriched, tiers, regions, sizes, settings, types, costCap, testOptionalOnly, sort]);

  const picks = useMemo(() => {
    if (!student) return [];
    return counselorPicks(student, schools, listIds);
  }, [student, listIds]);

  const toggleList = (school: School) => {
    if (listIds.has(school.id)) removeFromList(school.id);
    else if (student)
      addToList({
        schoolId: school.id,
        tier: chanceTier(student, school),
        status: "considering",
      });
  };

  if (!student) {
    return (
      <p className="body-copy">
        The explorer is built around a student profile.{" "}
        <Link href="/onboarding?role=student" className="underline underline-offset-2 text-ink">
          Set one up
        </Link>{" "}
        — it takes about ten minutes and makes everything here personal.
      </p>
    );
  }

  const activeFilterCount =
    tiers.length +
    regions.length + sizes.length + settings.length + types.length +
    (costCap ? 1 : 0) + (testOptionalOnly ? 1 : 0);

  const filterRail = (
    <div className="space-y-6">
      <div>
        <SectionLabel className="mb-2">Your chances</SectionLabel>
        <div className="flex flex-wrap gap-1.5">
          {TIERS.map((t) => (
            <Chip
              key={t.id}
              active={tiers.includes(t.id)}
              onClick={() => toggle(tiers, setTiers, t.id)}
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
            <Chip key={r} active={regions.includes(r)} onClick={() => toggle(regions, setRegions as (v: string[]) => void, r)} className="!min-h-[36px] !text-[0.82rem]">
              {regionLabel[r]}
            </Chip>
          ))}
        </div>
      </div>
      <div>
        <SectionLabel className="mb-2">Size</SectionLabel>
        <div className="flex flex-wrap gap-1.5">
          {SIZES.map((s) => (
            <Chip key={s.id} active={sizes.includes(s.id)} onClick={() => toggle(sizes, setSizes, s.id)} className="!min-h-[36px] !text-[0.82rem]">
              {s.label}
            </Chip>
          ))}
        </div>
      </div>
      <div>
        <SectionLabel className="mb-2">Setting</SectionLabel>
        <div className="flex flex-wrap gap-1.5">
          {SETTINGS.map((s) => (
            <Chip key={s.id} active={settings.includes(s.id)} onClick={() => toggle(settings, setSettings, s.id)} className="!min-h-[36px] !text-[0.82rem]">
              {s.label}
            </Chip>
          ))}
        </div>
      </div>
      <div>
        <SectionLabel className="mb-2">Type</SectionLabel>
        <div className="flex flex-wrap gap-1.5">
          {TYPES.map((t) => (
            <Chip key={t.id} active={types.includes(t.id)} onClick={() => toggle(types, setTypes, t.id)} className="!min-h-[36px] !text-[0.82rem]">
              {t.label}
            </Chip>
          ))}
        </div>
      </div>
      <div>
        <SectionLabel className="mb-2">Cost after aid</SectionLabel>
        <div className="flex flex-wrap gap-1.5">
          {COST_CAPS.map((c) => (
            <Chip key={c.id} active={costCap === c.id} onClick={() => setCostCap(c.id)} className="!min-h-[36px] !text-[0.82rem]">
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
        <Chip active={testOptionalOnly} onClick={() => setTestOptionalOnly((v) => !v)} className="!min-h-[36px] !text-[0.82rem]">
          Test-optional or blind only
        </Chip>
      </div>
    </div>
  );

  return (
    <div className="animate-fade-up">
      <div className="mb-8">
        <SectionLabel className="mb-3">Explore</SectionLabel>
        <TwoTone as="h1" size="lg" className="max-w-3xl">
          <em>{filtered.length} schools</em> worth your attention.
        </TwoTone>
      </div>

      {/* Counselor picks */}
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
                <p className="text-[0.85rem] text-gray-strong leading-relaxed">
                  {reason}
                </p>
              </Link>
            ))}
          </div>
        </section>
      )}

      <div className="flex gap-8">
        {/* Filter rail (desktop) */}
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
              Filters{activeFilterCount ? ` · ${activeFilterCount}` : ""}
            </button>
            <div className="flex items-center gap-2 ml-auto">
              <label htmlFor="sort" className="label-caps">
                Sort
              </label>
              <select
                id="sort"
                value={sort}
                onChange={(e) => setSort(e.target.value as SortKey)}
                className="border border-hairline rounded-[3px] bg-surface px-2 h-9 text-[0.85rem] outline-none focus:border-ink"
              >
                <option value="fit">Best fit</option>
                <option value="selectivity">Most selective</option>
                <option value="cost">Lowest net price</option>
                <option value="name">A–Z</option>
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

          {/* Results */}
          {view === "map" ? (
            <div className="border border-hairline rounded-[3px] bg-surface p-10 text-center">
              <p className="body-copy mx-auto">
                Map view is coming — for now, the grid shows distance-relevant
                info on each card.
              </p>
            </div>
          ) : view === "grid" ? (
            <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {filtered.map(({ school, tier, f }, i) => (
                <SchoolCard
                  key={school.id}
                  school={school}
                  tier={tier}
                  fitLabel={f.label}
                  index={i}
                  onList={listIds.has(school.id)}
                  onToggleList={() => toggleList(school)}
                />
              ))}
            </div>
          ) : (
            <ul className="divide-y divide-hairline border border-hairline rounded-[3px] bg-surface">
              {filtered.map(({ school, tier, f }) => (
                <li key={school.id} className="flex items-center gap-4 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/explore/${school.id}`}
                      className="font-medium hover:underline underline-offset-2"
                    >
                      {school.name}
                    </Link>
                    <p className="text-[0.8rem] text-gray-mid">
                      {school.city}, {school.state} · ~$
                      {Math.round(school.cost.avgNetPrice / 1000)}k net ·{" "}
                      {Math.round(school.admissions.acceptanceRate * 100)}% admit
                    </p>
                  </div>
                  <span className="hidden sm:block text-[0.82rem] text-accent font-medium">
                    {f.label}
                  </span>
                  <TierBadge tier={tier} />
                  <button
                    onClick={() => toggleList(school)}
                    className="text-[0.72rem] uppercase tracking-[0.08em] font-medium text-ink hover:text-accent whitespace-nowrap"
                  >
                    {listIds.has(school.id) ? "✓" : "+ List"}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Mobile filter bottom sheet */}
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
                className="text-[0.85rem] font-medium"
              >
                Done
              </button>
            </div>
            {filterRail}
          </div>
        </div>
      )}
    </div>
  );
}
