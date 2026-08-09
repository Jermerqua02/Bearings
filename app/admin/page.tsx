import { count, eq, gte, sql, sum } from "drizzle-orm";
import { db } from "@/lib/db";
import { aiUsage, essays, listEntries, users } from "@/lib/db/schema";
import SectionLabel from "@/components/ui/SectionLabel";
import TwoTone from "@/components/ui/TwoTone";
import Card from "@/components/ui/Card";

/* Admin overview.

   Counts and money only. No student content is read on this page — see
   lib/db/queries/admin.ts for the rule this follows. */

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card className="p-5">
      <SectionLabel className="mb-3">{label}</SectionLabel>
      <p className="text-[1.9rem] font-semibold tracking-tight tabular-nums">{value}</p>
      {sub && <p className="text-[0.85rem] text-gray-mid mt-1">{sub}</p>}
    </Card>
  );
}

export default async function AdminOverviewPage() {
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [[totals], [studentCount], [parentCount], [newToday], [listRows], [essayRows], [spend], [spendToday]] =
    await Promise.all([
      db.select({ n: count() }).from(users),
      db.select({ n: count() }).from(users).where(eq(users.role, "student")),
      db.select({ n: count() }).from(users).where(eq(users.role, "parent")),
      db.select({ n: count() }).from(users).where(gte(users.createdAt, dayAgo)),
      db.select({ n: count() }).from(listEntries),
      db.select({ n: count() }).from(essays),
      db.select({ m: sum(aiUsage.costMillicents) }).from(aiUsage),
      db.select({ m: sum(aiUsage.costMillicents) }).from(aiUsage).where(gte(aiUsage.createdAt, dayAgo)),
    ]);

  // Funnel: how many students got past onboarding into real activity.
  const [withList] = await db
    .select({ n: sql<number>`count(distinct ${listEntries.studentId})` })
    .from(listEntries);
  const [withEssay] = await db
    .select({ n: sql<number>`count(distinct ${essays.studentId})` })
    .from(essays);

  const dollars = (millicents: string | number | null) =>
    `$${(Number(millicents ?? 0) / 100_000).toFixed(2)}`;

  const students = Number(studentCount?.n ?? 0);
  const pct = (n: number) => (students === 0 ? "—" : `${Math.round((n / students) * 100)}%`);

  return (
    <div>
      <SectionLabel className="mb-4">Overview</SectionLabel>
      <TwoTone as="h1" size="lg" className="mb-8">
        <em>How Northstar is doing</em> right now.
      </TwoTone>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
        <Stat
          label="Accounts"
          value={String(totals?.n ?? 0)}
          sub={`${students} students · ${parentCount?.n ?? 0} parents`}
        />
        <Stat label="New in 24h" value={String(newToday?.n ?? 0)} />
        <Stat label="AI spend today" value={dollars(spendToday?.m ?? 0)} sub={`${dollars(spend?.m ?? 0)} all time`} />
        <Stat label="Schools listed" value={String(listRows?.n ?? 0)} sub={`${essayRows?.n ?? 0} essays started`} />
      </div>

      <SectionLabel className="mb-4">Where students get to</SectionLabel>
      <Card className="p-5">
        <dl className="grid sm:grid-cols-3 gap-6">
          <div>
            <dt className="text-[0.85rem] text-gray-mid">Signed up</dt>
            <dd className="text-[1.4rem] font-semibold tabular-nums">{students}</dd>
          </div>
          <div>
            <dt className="text-[0.85rem] text-gray-mid">Added a school</dt>
            <dd className="text-[1.4rem] font-semibold tabular-nums">
              {Number(withList?.n ?? 0)}{" "}
              <span className="text-[0.9rem] font-normal text-gray-mid">
                {pct(Number(withList?.n ?? 0))}
              </span>
            </dd>
          </div>
          <div>
            <dt className="text-[0.85rem] text-gray-mid">Started an essay</dt>
            <dd className="text-[1.4rem] font-semibold tabular-nums">
              {Number(withEssay?.n ?? 0)}{" "}
              <span className="text-[0.9rem] font-normal text-gray-mid">
                {pct(Number(withEssay?.n ?? 0))}
              </span>
            </dd>
          </div>
        </dl>
      </Card>

      <p className="mt-8 text-[0.85rem] text-gray-mid max-w-2xl leading-relaxed">
        Admins see counts and status only. Essay drafts and counselor
        conversations are not readable from here — that boundary is enforced in
        the query layer, not by what this page chooses to render.
      </p>
    </div>
  );
}
