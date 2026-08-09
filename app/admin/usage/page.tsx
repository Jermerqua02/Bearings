import type { Metadata } from "next";
import Card from "@/components/ui/Card";
import SectionLabel from "@/components/ui/SectionLabel";
import TwoTone from "@/components/ui/TwoTone";
import {
  ACTIVE_WINDOW_DAYS,
  MONTHLY_INFRA_USD,
  STORAGE_USD_PER_GB_MONTH,
  formatBytes,
  formatMillicents,
  formatTokens,
} from "@/lib/costs";
import { spendByFeature, totalsFrom, userCosts } from "@/lib/db/queries/admin";

export const metadata: Metadata = { title: "Cost per user · Northstar admin" };

/* What each user costs to serve.

   Counts and money only — see lib/db/queries/admin.ts for the boundary
   this page inherits. */

// Always fresh: a cached cost figure is a misleading cost figure.
export const dynamic = "force-dynamic";

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card className="p-5">
      <SectionLabel className="mb-3">{label}</SectionLabel>
      <p className="text-[1.7rem] font-semibold tracking-tight tabular-nums">{value}</p>
      {sub && <p className="text-[0.85rem] text-gray-mid mt-1">{sub}</p>}
    </Card>
  );
}

const FEATURE_LABEL: Record<string, string> = {
  chat: "Counselor chat",
  greet: "Greeting",
  essay_feedback: "Essay critique",
  interview: "Interview practice",
  why_school: "Why this school",
  throughline: "Throughline",
  summarize: "Summarize",
};

export default async function AdminUsagePage() {
  const [rows, features] = await Promise.all([userCosts(), spendByFeature()]);
  const totals = totalsFrom(rows);

  const days = (d: Date | null) =>
    d === null ? "never" : `${Math.floor((Date.now() - d.getTime()) / 86_400_000)}d ago`;

  return (
    <div>
      <SectionLabel className="mb-4">Cost per user</SectionLabel>
      <TwoTone as="h1" size="lg" className="mb-8">
        <em>What it costs</em> to serve each person.
      </TwoTone>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
        <Stat
          label="Monthly run rate"
          value={formatMillicents(totals.monthlyMillicents)}
          sub="AI (30d) + storage + infrastructure"
        />
        <Stat
          label="Mean per active user"
          value={formatMillicents(totals.meanPerActive)}
          sub={`median ${formatMillicents(totals.medianPerActive)}`}
        />
        <Stat
          label="AI spend"
          value={formatMillicents(totals.aiMillicents30d)}
          sub={`last 30d · ${formatMillicents(totals.aiMillicents)} all time`}
        />
        <Stat
          label="Storage"
          value={formatBytes(totals.storageBytes)}
          sub={`${formatMillicents(totals.storageMillicentsPerMonth)}/mo · ${totals.activeUsers} of ${totals.users} active`}
        />
      </div>

      <SectionLabel className="mb-4">Where the AI money goes</SectionLabel>
      <Card className="p-0 mb-10 overflow-hidden">
        {features.length === 0 ? (
          <p className="p-5 text-[0.9rem] text-gray-mid">
            No AI calls recorded yet.
          </p>
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

      <SectionLabel className="mb-4">Every account, most expensive first</SectionLabel>
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
                      {r.role} · seen {days(r.lastSeenAt)}
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
          cost is metered exactly at the moment of each call from the model&apos;s
          reported token counts. Storage is measured from real row sizes and
          priced at ${STORAGE_USD_PER_GB_MONTH.toFixed(2)}/GB-month. The flat $
          {MONTHLY_INFRA_USD}/month infrastructure bill is divided across users
          seen in the last {ACTIVE_WINDOW_DAYS} days, so &ldquo;total /mo&rdquo;
          is an all-in figure rather than AI alone. Rates live in{" "}
          <code>lib/costs.ts</code> — check them against the invoice before
          quoting them.
        </p>
        <p>
          Storage is measured, never read. This page can tell you a student
          wrote 40 KB of essay; it cannot tell you, or us, a word of it.
        </p>
      </div>
    </div>
  );
}
