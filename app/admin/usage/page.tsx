import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import Card from "@/components/ui/Card";
import SectionLabel from "@/components/ui/SectionLabel";
import TwoTone from "@/components/ui/TwoTone";
import { BarChart, PeriodToggle, Stat, periodFrom } from "../_components/Charts";
import BudgetPanel from "./BudgetPanel";
import { db } from "@/lib/db";
import { adminSettings, users } from "@/lib/db/schema";
import {
  ACTIVE_WINDOW_DAYS,
  STORAGE_USD_PER_GB_MONTH,
  formatBytes,
  formatMillicents,
  formatTokens,
  formatUsd,
  usdFromMillicents,
} from "@/lib/costs";
import {
  spendByDay,
  spendByFeature,
  spendSummary,
  spendThisMonth,
  totalsFrom,
  userCosts,
} from "@/lib/db/queries/admin";
import { railwayCost } from "@/lib/railway";

export const metadata: Metadata = { title: "Costs · Northstar admin" };
export const dynamic = "force-dynamic";

const FEATURE_LABEL: Record<string, string> = {
  chat: "Counselor chat",
  greet: "Greeting",
  essay_feedback: "Essay critique",
  interview: "Interview practice",
  why_school: "Why this school",
  throughline: "Throughline",
  summarize: "Summarize",
};

export default async function AdminCostsPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  const days = periodFrom((await searchParams).days);

  const [rows, features, daily, summary, monthAi, railway, settingsRows, adminRows] =
    await Promise.all([
      userCosts(),
      spendByFeature(),
      spendByDay(days),
      spendSummary(days),
      spendThisMonth(),
      railwayCost(),
      db.select().from(adminSettings).where(eq(adminSettings.id, "singleton")).limit(1),
      db.select({ email: users.email }).from(users).where(eq(users.role, "admin")),
    ]);

  const totals = totalsFrom(rows);
  const settings = settingsRows[0];

  // Month-to-date all-in: metered AI plus whatever infrastructure reports.
  const infraProjected = railway.configured ? railway.projectedUsd : 0;
  const monthToDateUsd = usdFromMillicents(monthAi) + infraProjected;

  const periodUsd = usdFromMillicents(summary.millicents);
  const ago = (d: Date | null) =>
    d === null ? "never" : `${Math.floor((Date.now() - d.getTime()) / 86_400_000)}d ago`;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
        <div>
          <SectionLabel className="mb-4">Costs</SectionLabel>
          <TwoTone as="h1" size="lg">
            <em>What it costs</em> to run this.
          </TwoTone>
        </div>
        <PeriodToggle base="/admin/usage" days={days} />
      </div>

      <BudgetPanel
        monthlyBudgetUsd={settings?.monthlyBudgetUsd ?? 25}
        alertThresholds={settings?.alertThresholds ?? [80, 100]}
        alertEmail={settings?.alertEmail ?? ""}
        alertsEnabled={settings?.alertsEnabled ?? true}
        spentUsd={monthToDateUsd}
        lastAlert={
          settings?.lastAlertAt
            ? `${settings.lastAlertThreshold ?? "?"}% on ${new Date(
                settings.lastAlertAt,
              ).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
            : null
        }
        adminEmails={adminRows.map((a) => a.email)}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
        <Stat
          label="Total (AI + infra)"
          value={formatUsd(monthToDateUsd)}
          sub="month to date"
          emphasis
        />
        <Stat
          label={`AI spend (${days}d)`}
          value={formatUsd(periodUsd)}
          sub={`${summary.calls} calls`}
        />
        <Stat
          label="Infrastructure"
          value={railway.configured ? formatUsd(railway.projectedUsd) : "—"}
          sub={railway.configured ? "projected this cycle" : "not connected"}
        />
        <Stat
          label="Tokens"
          value={formatTokens(summary.inputTokens + summary.outputTokens)}
          sub={`${formatTokens(summary.inputTokens)} in · ${formatTokens(summary.outputTokens)} out`}
        />
      </div>

      <Card className="p-5 mb-10">
        <div className="flex items-baseline justify-between mb-4">
          <SectionLabel>Daily AI cost</SectionLabel>
          <span className="text-[0.85rem] text-gray-mid tabular-nums">
            {formatUsd(periodUsd)} over {days} days
          </span>
        </div>
        <BarChart data={daily} format={(n) => formatMillicents(n)} />
      </Card>

      {/* Infrastructure, from Railway when it's connected. */}
      <Card className="p-5 mb-10">
        <div className="flex items-baseline justify-between mb-1">
          <SectionLabel>Railway (infrastructure)</SectionLabel>
          {railway.configured && (
            <span className="text-[1.05rem] font-semibold tabular-nums">
              {formatUsd(railway.projectedUsd)}
            </span>
          )}
        </div>
        {railway.configured ? (
          <>
            <p className="text-[0.85rem] text-gray-mid mb-4">
              Projected end-of-cycle cost for this billing month.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-[0.9rem] min-w-[32rem]">
                <thead>
                  <tr className="border-b border-hairline text-left text-gray-mid">
                    <th className="font-normal py-2">Resource</th>
                    <th className="font-normal py-2 text-right">Usage</th>
                    <th className="font-normal py-2">Unit</th>
                    <th className="font-normal py-2 text-right">Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {railway.resources.map((r) => (
                    <tr key={r.label} className="border-b border-hairline last:border-0">
                      <td className="py-2.5">{r.label}</td>
                      <td className="py-2.5 text-right tabular-nums text-gray-mid">
                        {r.usage.toLocaleString("en-US", { maximumFractionDigits: 2 })}
                      </td>
                      <td className="py-2.5 text-gray-mid">{r.unit}</td>
                      <td className="py-2.5 text-right tabular-nums">{formatUsd(r.costUsd)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <p className="text-[0.9rem] text-gray-mid leading-relaxed">
            {railway.reason} Until then, infrastructure is excluded from the
            totals above and each user&apos;s share below uses the flat estimate
            in <code>lib/costs.ts</code>.
          </p>
        )}
      </Card>

      <SectionLabel className="mb-4">Where the AI money goes</SectionLabel>
      <Card className="p-0 mb-10 overflow-hidden">
        {features.length === 0 ? (
          <p className="p-5 text-[0.9rem] text-gray-mid">No AI calls recorded yet.</p>
        ) : (
          <table className="w-full text-[0.9rem]">
            <thead>
              <tr className="border-b border-hairline text-left text-gray-mid">
                <th className="font-normal px-5 py-3">Feature</th>
                <th className="font-normal px-5 py-3 text-right">Calls</th>
                <th className="font-normal px-5 py-3 text-right">Last 30d</th>
                <th className="font-normal px-5 py-3 text-right">All time</th>
              </tr>
            </thead>
            <tbody>
              {features.map((f) => (
                <tr key={f.feature} className="border-b border-hairline last:border-0">
                  <td className="px-5 py-3">{FEATURE_LABEL[f.feature] ?? f.feature}</td>
                  <td className="px-5 py-3 text-right tabular-nums text-gray-mid">{f.calls}</td>
                  <td className="px-5 py-3 text-right tabular-nums">
                    {formatMillicents(f.millicents30d)}
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums text-gray-mid">
                    {formatMillicents(f.millicents)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <div className="flex flex-wrap items-baseline justify-between gap-3 mb-4">
        <SectionLabel>Cost per user</SectionLabel>
        <span className="text-[0.85rem] text-gray-mid">
          mean {formatMillicents(totals.meanPerActive)} · median{" "}
          {formatMillicents(totals.medianPerActive)} across {totals.activeUsers} active
        </span>
      </div>
      <Card className="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[0.9rem] min-w-[52rem]">
            <thead>
              <tr className="border-b border-hairline text-left text-gray-mid">
                <th className="font-normal px-5 py-3">Account</th>
                <th className="font-normal px-5 py-3 text-right">AI 30d</th>
                <th className="font-normal px-5 py-3 text-right">AI total</th>
                <th className="font-normal px-5 py-3 text-right">Calls</th>
                <th className="font-normal px-5 py-3 text-right">Tokens</th>
                <th className="font-normal px-5 py-3 text-right">Storage</th>
                <th className="font-normal px-5 py-3 text-right">Total /mo</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-6 text-gray-mid">
                    No accounts yet.
                  </td>
                </tr>
              )}
              {rows.map((r) => (
                <tr key={r.userId} className="border-b border-hairline last:border-0">
                  <td className="px-5 py-3">
                    <span className="block">{r.email}</span>
                    <span className="text-[0.8rem] text-gray-mid">
                      {r.role} · seen {ago(r.lastSeenAt)}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums">
                    {formatMillicents(r.aiMillicents30d)}
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums text-gray-mid">
                    {formatMillicents(r.aiMillicents)}
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums text-gray-mid">{r.aiCalls}</td>
                  <td className="px-5 py-3 text-right tabular-nums text-gray-mid">
                    {formatTokens(r.inputTokens + r.outputTokens)}
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums text-gray-mid">
                    {formatBytes(r.storageBytes)}
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums font-semibold">
                    {formatMillicents(r.monthlyMillicents)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="mt-8 text-[0.85rem] text-gray-mid max-w-2xl leading-relaxed flex flex-col gap-2">
        <p>
          <strong className="text-gray-strong">How these are calculated.</strong> AI
          cost is metered exactly at each call from the model&apos;s reported token
          counts. Storage is measured from real row sizes at $
          {STORAGE_USD_PER_GB_MONTH.toFixed(2)}/GB-month. Fixed infrastructure is
          divided across users seen in the last {ACTIVE_WINDOW_DAYS} days, so
          &ldquo;total /mo&rdquo; is all-in rather than AI alone. Rates live in{" "}
          <code>lib/costs.ts</code> — check them against the invoice.
        </p>
        <p>
          Storage is measured, never read. This page can tell you a student wrote
          40 KB of essay; it cannot tell you, or us, a word of it.
        </p>
      </div>
    </div>
  );
}
