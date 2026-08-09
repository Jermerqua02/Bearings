/* Admin chart and layout primitives.

   Deliberately dependency-free SVG. A charting library would be more than
   these need — bars and a sparkline — and the admin pages should stay
   cheap to render and free of client JavaScript wherever they can. */

import Card from "@/components/ui/Card";
import SectionLabel from "@/components/ui/SectionLabel";

export function Stat({
  label,
  value,
  sub,
  emphasis,
}: {
  label: string;
  value: string;
  sub?: string;
  emphasis?: boolean;
}) {
  return (
    <Card className={`p-5 ${emphasis ? "border-ink" : ""}`}>
      <SectionLabel className="mb-3">{label}</SectionLabel>
      <p className="text-[1.7rem] font-semibold tracking-tight tabular-nums leading-none">
        {value}
      </p>
      {sub && <p className="text-[0.82rem] text-gray-mid mt-2 leading-snug">{sub}</p>}
    </Card>
  );
}

/**
 * A bar chart over days.
 *
 * Zero-filled series come in from the query layer, so a quiet day renders
 * as a gap rather than being dropped and silently rescaling the axis.
 */
export function BarChart({
  data,
  height = 140,
  format = (n: number) => String(n),
}: {
  data: Array<{ day: string; value: number }>;
  height?: number;
  format?: (n: number) => string;
}) {
  if (data.length === 0) {
    return <p className="text-[0.9rem] text-gray-mid">Nothing recorded yet.</p>;
  }

  const max = Math.max(...data.map((d) => d.value), 1);
  // Label every nth day so the axis stays legible at 90 days.
  const step = Math.ceil(data.length / 12);

  return (
    <div>
      <div className="flex items-end gap-[3px]" style={{ height }}>
        {data.map((d, i) => {
          const h = d.value === 0 ? 2 : Math.max(3, (d.value / max) * height);
          return (
            <div
              key={`${d.day}-${i}`}
              className="flex-1 min-w-[3px] rounded-t-sm bg-ink/85 hover:bg-ink transition-quiet"
              style={{ height: h }}
              title={`${d.day}: ${format(d.value)}`}
            />
          );
        })}
      </div>
      <div className="flex gap-[3px] mt-2">
        {data.map((d, i) => (
          <div key={`l-${d.day}-${i}`} className="flex-1 min-w-[3px] text-center">
            {i % step === 0 && (
              <span className="text-[0.6rem] text-gray-mid tabular-nums">{d.day}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/** A horizontal funnel — each stage as a proportion of the first. */
export function Funnel({ steps }: { steps: Array<{ label: string; count: number }> }) {
  const first = steps[0]?.count ?? 0;
  const top = Math.max(first, 1);
  return (
    <div className="flex flex-col gap-3">
      {steps.map((s) => {
        // Clamped: a later stage can exceed the first when roles change
        // under the data — a student who became an admin still has a
        // school list. Better a full bar than one running off the card.
        const pct = Math.min(100, Math.round((s.count / top) * 100));
        return (
          <div key={s.label}>
            <div className="flex justify-between text-[0.88rem] mb-1.5">
              <span>{s.label}</span>
              <span className="tabular-nums text-gray-mid">
                {s.count}
                <span className="ml-2 text-gray-mid">{first > 0 ? `${pct}%` : "—"}</span>
              </span>
            </div>
            <div className="h-2 rounded-full bg-fill overflow-hidden">
              <div className="h-full bg-ink rounded-full" style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** 7 / 30 / 90-day selector, as links so the page stays a server component. */
export function PeriodToggle({ base, days }: { base: string; days: number }) {
  const options = [7, 30, 90];
  return (
    <div className="inline-flex rounded-lg border border-hairline overflow-hidden">
      {options.map((d) => (
        <a
          key={d}
          href={`${base}?days=${d}`}
          className={`px-3.5 py-1.5 text-[0.85rem] transition-quiet ${
            d === days ? "bg-ink text-paper" : "bg-surface text-gray-mid hover:text-ink"
          }`}
        >
          {d} days
        </a>
      ))}
    </div>
  );
}

/** Clamp an arbitrary ?days= to one the queries are built for. */
export function periodFrom(value: string | string[] | undefined): number {
  const n = Number(Array.isArray(value) ? value[0] : value);
  return n === 7 || n === 90 ? n : 30;
}
