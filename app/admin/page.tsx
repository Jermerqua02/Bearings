import type { Metadata } from "next";
import Link from "next/link";
import { and, count, eq, gte, sql } from "drizzle-orm";
import Card from "@/components/ui/Card";
import SectionLabel from "@/components/ui/SectionLabel";
import TwoTone from "@/components/ui/TwoTone";
import { Stat } from "./_components/Charts";
import { db } from "@/lib/db";
import { feedback, users } from "@/lib/db/schema";
import { formatUsd, usdFromMillicents } from "@/lib/costs";
import { spendThisMonth, telemetry } from "@/lib/db/queries/admin";
import { railwayCost } from "@/lib/railway";
import { hasUnfilledPlaceholders } from "@/lib/legal";

export const metadata: Metadata = { title: "Admin · Northstar" };
export const dynamic = "force-dynamic";

/* Admin overview.

   A front page, not a dashboard: the few numbers worth seeing first, plus
   anything that actually needs attention. Counts and money only — see
   lib/db/queries/admin.ts for the rule this follows. */

export default async function AdminOverviewPage() {
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [t, monthAi, railway, [openFeedback], [newToday]] = await Promise.all([
    telemetry(30),
    spendThisMonth(),
    railwayCost(),
    db.select({ n: count() }).from(feedback).where(eq(feedback.status, "open")),
    db.select({ n: count() }).from(users).where(gte(users.createdAt, dayAgo)),
  ]);

  // Accounts with no consent row — created before the signup gate existed.
  const [noConsent] = await db.execute<{ n: string }>(sql`
    select count(*) as n from "user" u
    where not exists (select 1 from "legal_consent" c where c.user_id = u.id)
  `);

  const infra = railway.configured ? railway.projectedUsd : 0;
  const allIn = usdFromMillicents(monthAi) + infra;

  const attention: Array<{ text: string; href: string; cta: string }> = [];
  if (Number(openFeedback?.n ?? 0) > 0) {
    attention.push({
      text: `${openFeedback!.n} open feedback report${Number(openFeedback!.n) === 1 ? "" : "s"}.`,
      href: "/admin/feedback",
      cta: "Read",
    });
  }
  if (Number(noConsent?.n ?? 0) > 0) {
    attention.push({
      text: `${noConsent!.n} account${Number(noConsent!.n) === 1 ? "" : "s"} with no recorded consent.`,
      href: "/admin/users",
      cta: "Review",
    });
  }
  if (!railway.configured) {
    attention.push({
      text: "Infrastructure cost isn't connected, so totals are AI-only.",
      href: "/admin/apis",
      cta: "Set up",
    });
  }
  if (hasUnfilledPlaceholders()) {
    attention.push({
      text: "Terms and Privacy still contain unfilled placeholders.",
      href: "/terms",
      cta: "See",
    });
  }

  return (
    <div>
      <SectionLabel className="mb-4">Overview</SectionLabel>
      <TwoTone as="h1" size="lg" className="mb-8">
        <em>How Northstar is doing</em> right now.
      </TwoTone>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
        <Stat
          label="Accounts"
          value={String(t.totalUsers)}
          sub={`${t.students} students · ${t.parents} parents`}
          emphasis
        />
        <Stat
          label="Active"
          value={String(t.wau)}
          sub={`this week · ${newToday?.n ?? 0} new today`}
        />
        <Stat
          label="Spend this month"
          value={formatUsd(allIn)}
          sub={
            railway.configured
              ? `${formatUsd(usdFromMillicents(monthAi))} AI · ${formatUsd(infra)} infra`
              : `${formatUsd(usdFromMillicents(monthAi))} AI · infra not connected`
          }
        />
        <Stat
          label="Open feedback"
          value={String(openFeedback?.n ?? 0)}
          sub={`${t.essaysStarted} essays · ${t.schoolsListed} schools listed`}
        />
      </div>

      {attention.length > 0 && (
        <>
          <SectionLabel className="mb-4">Needs attention</SectionLabel>
          <Card className="p-0 mb-10 overflow-hidden">
            {attention.map((a) => (
              <div
                key={a.href + a.text}
                className="flex items-center justify-between gap-4 px-5 py-3.5 border-b border-hairline last:border-0"
              >
                <span className="text-[0.92rem]">{a.text}</span>
                <Link
                  href={a.href}
                  className="text-[0.88rem] text-ink underline underline-offset-4 whitespace-nowrap"
                >
                  {a.cta}
                </Link>
              </div>
            ))}
          </Card>
        </>
      )}

      <SectionLabel className="mb-4">Go to</SectionLabel>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {[
          { href: "/admin/telemetry", title: "Telemetry", body: "Growth, activity, and where students drop off." },
          { href: "/admin/users", title: "Users", body: "Search accounts, change roles, delete." },
          { href: "/admin/feedback", title: "Feedback", body: "What people have told us is wrong." },
          { href: "/admin/usage", title: "Costs", body: "Budget, AI spend, infrastructure, per user." },
          { href: "/admin/apis", title: "APIs", body: "External services and what's configured." },
        ].map((c) => (
          <Link key={c.href} href={c.href}>
            <Card className="p-5 h-full hover:border-ink transition-quiet">
              <p className="text-[1rem] font-medium mb-1">{c.title}</p>
              <p className="text-[0.85rem] text-gray-mid leading-relaxed">{c.body}</p>
            </Card>
          </Link>
        ))}
      </div>

      <p className="mt-8 text-[0.85rem] text-gray-mid max-w-2xl leading-relaxed">
        Admins see counts, status, and money. Essay drafts and counselor
        conversations are not readable from here — that boundary is enforced in
        the query layer, not by what these pages choose to render.
      </p>
    </div>
  );
}
