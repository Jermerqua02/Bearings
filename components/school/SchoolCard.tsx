"use client";

import Link from "next/link";
import SchoolPhoto from "@/components/school/SchoolPhoto";
import TierBadge from "@/components/ui/TierBadge";
import type { FitLabel } from "@/lib/match";
import type { ChanceTier, School } from "@/lib/types";

export default function SchoolCard({
  school,
  tier,
  fitLabel,
  index,
  onList,
  onToggleList,
}: {
  school: School;
  tier: ChanceTier;
  fitLabel: FitLabel;
  index?: number;
  onList: boolean;
  onToggleList: () => void;
}) {
  return (
    <article className="border border-hairline bg-surface rounded-[3px] overflow-hidden flex flex-col group">
      <Link href={`/explore/${school.id}`} className="block relative">
        <SchoolPhoto name={school.name} />
        {index !== undefined && (
          <span className="card-index absolute top-3 left-3">
            {String(index + 1).padStart(2, "0")}
          </span>
        )}
      </Link>
      <div className="p-4 flex flex-col gap-2 flex-1">
        <div className="flex items-start justify-between gap-2">
          <Link
            href={`/explore/${school.id}`}
            className="font-semibold text-[1rem] leading-snug hover:underline underline-offset-2"
          >
            {school.name}
          </Link>
          <TierBadge tier={tier} />
        </div>
        <p className="label-caps">
          {school.city}, {school.state}
        </p>
        <div className="flex items-center justify-between text-[0.85rem] text-gray-strong mt-auto pt-2">
          <span>
            ~${Math.round(school.cost.avgNetPrice / 1000)}k net / yr
          </span>
          <span>{Math.round(school.admissions.acceptanceRate * 100)}% admit</span>
        </div>
        <div className="flex items-center justify-between pt-2 border-t border-hairline">
          <span className="text-[0.82rem] text-accent font-medium">{fitLabel}</span>
          <button
            onClick={onToggleList}
            className={`text-[0.72rem] uppercase tracking-[0.08em] font-medium transition-quiet ${
              onList ? "text-gray-mid" : "text-ink hover:text-accent"
            }`}
          >
            {onList ? "On your list ✓" : "+ Add to list"}
          </button>
        </div>
      </div>
    </article>
  );
}
