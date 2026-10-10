import type { Metadata } from "next";
import { desc, eq } from "drizzle-orm";
import SectionLabel from "@/components/ui/SectionLabel";
import TwoTone from "@/components/ui/TwoTone";
import AccessList, { type AccessRow } from "./AccessList";
import { db } from "@/lib/db";
import { freeAccessRequests, users } from "@/lib/db/schema";
import { FREE_ACCESS_MONTHS } from "@/lib/free-access";

export const metadata: Metadata = { title: "Free access · Lumni admin" };
export const dynamic = "force-dynamic";

export default async function AdminAccessPage() {
  const rows = await db
    .select({
      id: freeAccessRequests.id,
      email: users.email,
      name: users.name,
      role: users.role,
      message: freeAccessRequests.message,
      schoolName: freeAccessRequests.schoolName,
      status: freeAccessRequests.status,
      decisionNote: freeAccessRequests.decisionNote,
      createdAt: freeAccessRequests.createdAt,
      decidedAt: freeAccessRequests.decidedAt,
    })
    .from(freeAccessRequests)
    .innerJoin(users, eq(users.id, freeAccessRequests.userId))
    .orderBy(desc(freeAccessRequests.createdAt))
    .limit(300);

  const list: AccessRow[] = rows.map((r) => ({
    ...r,
    role: String(r.role),
    createdAt: r.createdAt.toISOString(),
    decidedAt: r.decidedAt?.toISOString() ?? null,
  }));
  const pending = list.filter((r) => r.status === "pending").length;

  return (
    <div>
      <SectionLabel className="mb-4">Free access</SectionLabel>
      <TwoTone as="h1" size="lg" className="mb-8">
        <em>{pending === 0 ? "No one waiting" : `${pending} waiting`}</em> for free Pro.
      </TwoTone>
      <AccessList rows={list} />
      <p className="mt-8 text-[0.85rem] text-gray-mid max-w-2xl leading-relaxed">
        Approving gives the account {FREE_ACCESS_MONTHS} months of Pro — shared with a linked parent or student — and
        emails them. Declining emails them too, with your note if you add one. Every decision is in the
        account&apos;s history on the Users page.
      </p>
    </div>
  );
}
