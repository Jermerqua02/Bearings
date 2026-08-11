"use client";

import Link from "next/link";
import SchoolPhoto from "@/components/school/SchoolPhoto";
import TierBadge from "@/components/ui/TierBadge";
import { formatRate, formatThousands } from "@/lib/format";
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
      {/* The photo links to the same place as the school name below it, and
          its contents are aria-hidden — so to a screen reader this was a link
          with no name at all. Hiding it removes both that and the duplicate
          stop in the tab order; the name below is the real link. */}
      <Link
        href={`/explore/${school.id}`}
        className="block relative"
        aria-hidden="true"
        tabIndex={-1}
      >
        <SchoolPhoto schoolId={school.id} name={school.name} />
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
            {school.cost.avgNetPrice == null
              ? "Net price not reported"
              : `~${formatThousands(school.cost.avgNetPrice)} net / yr`}
          </span>
          <span>
            {school.admissions.acceptanceRate == null
              ? ""
              : `${formatRate(school.admissions.acceptanceRate)} admit`}
          </span>
        </div>
        <div className="flex items-center justify-between pt-2 border-t border-hairline">
          <span className="text-[0.82rem] text-accent font-medium">{fitLabel}</span>
          <button
            onClick={onToggleList}
            aria-pressed={onList}
            aria-label={
              onList ? `Remove ${school.name} from your list` : `Add ${school.name} to your list`
            }
            /* -my-2 py-2 grows the touch target past the text box without
               moving anything: this row is 18px tall on the mobile grid. */
            className={`text-[0.72rem] uppercase tracking-[0.08em] font-medium transition-quiet -my-2 py-2 -mr-1 pr-1 ${
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
