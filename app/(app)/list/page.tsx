"use client";

/* My list — Reach / Target / Likely columns with drag-and-drop,
   a balance meter that tells the truth, and compare mode. */

import { useMemo, useState } from "react";
import Link from "next/link";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import SectionLabel from "@/components/ui/SectionLabel";
import TierBadge from "@/components/ui/TierBadge";
import TwoTone from "@/components/ui/TwoTone";
import { getSchool } from "@/lib/data/schools";
import { daysUntil, listBalance, nextDeadline } from "@/lib/match";
import { useApp } from "@/lib/profile-context";
import type { ApplicationPlan, ChanceTier, ListEntry } from "@/lib/types";

const TIERS: ChanceTier[] = ["reach", "target", "likely"];

const statusLabel: Record<ListEntry["status"], string> = {
  considering: "Considering",
  applying: "Applying",
  "in-progress": "In progress",
  submitted: "Submitted",
  "materials-received": "Materials received",
  decision: "Decision in",
};

function ListRow({
  entry,
  onDragStart,
  compareMode,
  compared,
  onToggleCompare,
}: {
  entry: ListEntry;
  onDragStart: (e: React.DragEvent) => void;
  compareMode: boolean;
  compared: boolean;
  onToggleCompare: () => void;
}) {
  const { updateListEntry, removeFromList } = useApp();
  const school = getSchool(entry.schoolId);
  if (!school) return null;
  const dl = nextDeadline(school, entry.plan);
  const days = dl ? daysUntil(dl.date) : null;

  return (
    <div
      draggable={!compareMode}
      onDragStart={onDragStart}
      className={`border border-hairline bg-surface rounded-[3px] p-4 ${
        compareMode ? "" : "cursor-grab active:cursor-grabbing"
      } ${compared ? "border-accent" : ""}`}
    >
      <div className="flex items-start justify-between gap-2 mb-1">
        <Link
          href={`/explore/${school.id}`}
          className="font-semibold text-[0.95rem] leading-snug hover:underline underline-offset-2"
        >
          {school.shortName}
        </Link>
        {compareMode ? (
          <button
            onClick={onToggleCompare}
            aria-pressed={compared}
            className={`text-[0.72rem] uppercase tracking-[0.08em] font-medium ${
              compared ? "text-accent" : "text-gray-mid hover:text-ink"
            }`}
          >
            {compared ? "Selected" : "Compare"}
          </button>
        ) : (
          <button
            onClick={() => removeFromList(school.id)}
            aria-label={`Remove ${school.shortName}`}
            className="text-gray-mid hover:text-ink text-[0.85rem] leading-none"
          >
            ✕
          </button>
        )}
      </div>
      <p className="text-[0.78rem] text-gray-mid mb-3">
        {statusLabel[entry.status]}
        {dl && days !== null && days >= 0 && (
          <> · {dl.plan} in <span className={days <= 14 ? "text-ink font-medium" : ""}>{days} days</span></>
        )}
      </p>
      <div className="flex items-center gap-2">
        <select
          value={entry.plan ?? ""}
          onChange={(e) =>
            updateListEntry(school.id, {
              plan: (e.target.value || undefined) as ApplicationPlan | undefined,
            })
          }
          aria-label={`Application plan for ${school.shortName}`}
          className="border border-hairline rounded-[3px] bg-surface px-1.5 h-8 text-[0.78rem] outline-none focus:border-ink"
        >
          <option value="">Plan…</option>
          {school.admissions.plansOffered.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
        <select
          value={entry.tier}
          onChange={(e) =>
            updateListEntry(school.id, { tier: e.target.value as ChanceTier })
          }
          aria-label={`Tier for ${school.shortName}`}
          className="md:hidden border border-hairline rounded-[3px] bg-surface px-1.5 h-8 text-[0.78rem] outline-none focus:border-ink"
        >
          {TIERS.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <select
          value={entry.status}
          onChange={(e) =>
            updateListEntry(school.id, {
              status: e.target.value as ListEntry["status"],
            })
          }
          aria-label={`Status for ${school.shortName}`}
          className="border border-hairline rounded-[3px] bg-surface px-1.5 h-8 text-[0.78rem] outline-none focus:border-ink"
        >
          {Object.entries(statusLabel).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
      </div>
    </div>
  );
}

export default function ListPage() {
  const { list, updateListEntry } = useApp();
  const [compareMode, setCompareMode] = useState(false);
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overTier, setOverTier] = useState<ChanceTier | null>(null);

  const counts = useMemo(
    () => ({
      reach: list.filter((e) => e.tier === "reach").length,
      target: list.filter((e) => e.tier === "target").length,
      likely: list.filter((e) => e.tier === "likely").length,
    }),
    [list]
  );
  const balance = listBalance(counts);
  const total = list.length || 1;

  const toggleCompare = (id: string) =>
    setCompareIds((prev) =>
      prev.includes(id)
        ? prev.filter((x) => x !== id)
        : prev.length >= 4
          ? prev
          : [...prev, id]
    );

  const comparedSchools = compareIds
    .map((id) => getSchool(id))
    .filter((s): s is NonNullable<typeof s> => !!s);

  return (
    <div className="animate-fade-up">
      <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
        <div>
          <SectionLabel className="mb-3">My list</SectionLabel>
          <TwoTone as="h1" size="lg">
            <em>{list.length} schools.</em> Here&apos;s the shape of it.
          </TwoTone>
        </div>
        <Button
          variant={compareMode ? "primary" : "outline"}
          onClick={() => {
            setCompareMode((v) => !v);
            setCompareIds([]);
          }}
        >
          {compareMode ? "Exit compare" : "Compare schools"}
        </Button>
      </div>

      {/* Balance meter */}
      <Card className="p-5 mb-8">
        <div className="flex h-2.5 rounded-full overflow-hidden bg-fill mb-3">
          <div className="bg-reach transition-quiet" style={{ width: `${(counts.reach / total) * 100}%` }} />
          <div className="bg-target transition-quiet" style={{ width: `${(counts.target / total) * 100}%` }} />
          <div className="bg-likely transition-quiet" style={{ width: `${(counts.likely / total) * 100}%` }} />
        </div>
        <p className={`text-[0.95rem] ${balance.healthy ? "text-gray-strong" : "text-ink"}`}>
          {balance.message}
        </p>
      </Card>

      {/* Compare table */}
      {compareMode && comparedSchools.length >= 2 && (
        <Card className="p-5 mb-8 overflow-x-auto">
          <SectionLabel className="mb-4">
            Side by side — {comparedSchools.length} of 4
          </SectionLabel>
          <table className="w-full text-[0.88rem] min-w-[560px]">
            <thead>
              <tr>
                <th />
                {comparedSchools.map((s) => (
                  <th key={s.id} className="text-left font-semibold pb-3 pr-4">{s.shortName}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(
                [
                  ["Avg net price / yr", (s: NonNullable<ReturnType<typeof getSchool>>) => `$${s.cost.avgNetPrice.toLocaleString()}`],
                  ["Acceptance rate", (s) => `${Math.round(s.admissions.acceptanceRate * 100)}%`],
                  ["Setting", (s) => s.setting.replace("-", " ")],
                  ["Undergrads", (s) => s.undergradEnrollment.toLocaleString()],
                  ["Grad rate", (s) => `${Math.round(s.outcomes.gradRate * 100)}%`],
                  ["Median earnings", (s) => `$${s.outcomes.medianEarnings10yr.toLocaleString()}`],
                  ["Need met", (s) => `${Math.round(s.cost.percentNeedMet * 100)}%`],
                ] as [string, (s: NonNullable<ReturnType<typeof getSchool>>) => string][]
              ).map(([label, fn]) => (
                <tr key={label} className="border-t border-hairline">
                  <td className="label-caps py-2.5 pr-3 whitespace-nowrap">{label}</td>
                  {comparedSchools.map((s) => (
                    <td key={s.id} className="py-2.5 pr-4">{fn(s)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {/* Columns */}
      <div className="grid md:grid-cols-3 gap-4">
        {TIERS.map((tier) => (
          <section
            key={tier}
            aria-label={`${tier} schools`}
            onDragOver={(e) => {
              e.preventDefault();
              setOverTier(tier);
            }}
            onDragLeave={() => setOverTier(null)}
            onDrop={() => {
              if (dragId) updateListEntry(dragId, { tier });
              setDragId(null);
              setOverTier(null);
            }}
            className={`rounded-[3px] border p-3 min-h-[240px] transition-quiet ${
              overTier === tier ? "border-accent bg-accent-soft" : "border-hairline bg-fill/40"
            }`}
          >
            <div className="flex items-center justify-between px-1 mb-3">
              <TierBadge tier={tier} />
              <span className="label-caps">{counts[tier]}</span>
            </div>
            <div className="space-y-3">
              {list
                .filter((e) => e.tier === tier)
                .map((entry) => (
                  <ListRow
                    key={entry.schoolId}
                    entry={entry}
                    onDragStart={() => setDragId(entry.schoolId)}
                    compareMode={compareMode}
                    compared={compareIds.includes(entry.schoolId)}
                    onToggleCompare={() => toggleCompare(entry.schoolId)}
                  />
                ))}
            </div>
            {/* Mobile-friendly move buttons */}
            {!compareMode && (
              <p className="text-[0.72rem] text-gray-mid px-1 mt-3 md:hidden">
                Tip: use the tier menus on a card to move schools between columns.
              </p>
            )}
          </section>
        ))}
      </div>

      <p className="text-[0.85rem] text-gray-mid mt-6 max-w-2xl">
        Tiers are my read of where students with your profile tend to land —
        they&apos;re categories, not promises. Drag cards between columns if you
        disagree; it&apos;s your list.
      </p>
    </div>
  );
}
