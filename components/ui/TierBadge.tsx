import type { ChanceTier } from "@/lib/types";

const tierStyles: Record<ChanceTier, { bg: string; fg: string; label: string }> =
  {
    reach: { bg: "bg-reach-soft", fg: "text-reach", label: "Reach" },
    target: { bg: "bg-target-soft", fg: "text-target", label: "Target" },
    likely: { bg: "bg-likely-soft", fg: "text-likely", label: "Likely" },
  };

/* Muted chance-tier badge. Deliberately not red/yellow/green. */
export default function TierBadge({ tier }: { tier: ChanceTier }) {
  const s = tierStyles[tier];
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[0.72rem] uppercase tracking-[0.08em] font-medium ${s.bg} ${s.fg}`}
    >
      {s.label}
    </span>
  );
}
