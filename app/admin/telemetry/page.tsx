import type { Metadata } from "next";
import Card from "@/components/ui/Card";
import SectionLabel from "@/components/ui/SectionLabel";
import TwoTone from "@/components/ui/TwoTone";
import { BarChart, Funnel, PeriodToggle, Stat, periodFrom } from "../_components/Charts";
import { telemetry } from "@/lib/db/queries/admin";
import { formatTokens } from "@/lib/costs";

export const metadata: Metadata = { title: "Telemetry · Northstar admin" };
export const dynamic = "force-dynamic";

export default async function AdminTelemetryPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  const days = periodFrom((await searchParams).days);
  const t = await telemetry(days);

  const pct = (n: number, of: number) => (of === 0 ? "—" : `${Math.round((n / of) * 100)}%`);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
        <div>
          <SectionLabel className="mb-4">Telemetry</SectionLabel>
          <TwoTone as="h1" size="lg">
            <em>Who&apos;s here</em> and what they do.
          </TwoTone>
        </div>
        <PeriodToggle base="/admin/telemetry" days={days} />
      </div>

      <SectionLabel className="mb-3">Users</SectionLabel>
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-10">
        <Stat label="Total" value={String(t.totalUsers)} emphasis />
        <Stat label="Students" value={String(t.students)} sub={pct(t.students, t.totalUsers)} />
        <Stat label="Parents" value={String(t.parents)} sub={pct(t.parents, t.totalUsers)} />
        <Stat label="Admins" value={String(t.admins)} />
        <Stat label={`New (${days}d)`} value={String(t.newInPeriod)} />
      </div>

      <SectionLabel className="mb-3">Active users</SectionLabel>
      <div className="grid grid-cols-3 gap-4 mb-4">
        <Stat label="DAU (24h)" value={String(t.dau)} />
        <Stat label="WAU (7d)" value={String(t.wau)} />
        <Stat label="MAU (30d)" value={String(t.mau)} />
      </div>
      <p className="text-[0.82rem] text-gray-mid mb-4 max-w-3xl leading-relaxed">
        Counted from session records — the only universal sign that someone
        showed up. A single long session spanning several days counts once, so
        these undercount rather than flatter.
      </p>
      <Card className="p-5 mb-10">
        <SectionLabel className="mb-4">Active users by day</SectionLabel>
        <BarChart data={t.activeByDay} />
      </Card>

      <div className="grid lg:grid-cols-2 gap-4 mb-10">
        <Card className="p-5">
          <SectionLabel className="mb-4">Signups by day</SectionLabel>
          <BarChart data={t.signupsByDay} />
        </Card>
        <Card className="p-5">
          <SectionLabel className="mb-4">AI calls by day</SectionLabel>
          <BarChart data={t.aiCallsByDay} />
        </Card>
      </div>

      <SectionLabel className="mb-3">How far students get</SectionLabel>
      <Card className="p-5 mb-10">
        <Funnel steps={t.funnel} />
        <p className="text-[0.82rem] text-gray-mid mt-5 leading-relaxed">
          Each stage as a share of students who signed up. The drop between two
          stages is where the product is losing people.
        </p>
      </Card>

      <SectionLabel className="mb-3">Activity totals</SectionLabel>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat label="Schools listed" value={formatTokens(t.schoolsListed)} />
        <Stat label="Essays started" value={String(t.essaysStarted)} />
        <Stat label="Counselor messages" value={formatTokens(t.counselorMessages)} />
        <Stat label="Interview sessions" value={String(t.interviewSessions)} />
      </div>

      <p className="mt-8 text-[0.85rem] text-gray-mid max-w-2xl leading-relaxed">
        Counts only. This page can tell you a student sent forty messages to the
        counselor and cannot show you one of them.
      </p>
    </div>
  );
}
