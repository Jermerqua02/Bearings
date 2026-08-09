import type { Metadata } from "next";
import { desc } from "drizzle-orm";
import SectionLabel from "@/components/ui/SectionLabel";
import TwoTone from "@/components/ui/TwoTone";
import FeedbackList, { type FeedbackRow } from "./FeedbackList";
import { db } from "@/lib/db";
import { feedback } from "@/lib/db/schema";

export const metadata: Metadata = { title: "Feedback · Northstar admin" };
export const dynamic = "force-dynamic";

export default async function AdminFeedbackPage() {
  const rows = await db.select().from(feedback).orderBy(desc(feedback.createdAt)).limit(200);

  const list: FeedbackRow[] = rows.map((r) => ({
    id: r.id,
    email: r.email,
    message: r.message,
    path: r.path,
    status: r.status,
    createdAt: r.createdAt.toISOString(),
  }));

  return (
    <div>
      <SectionLabel className="mb-4">Feedback</SectionLabel>
      <TwoTone as="h1" size="lg" className="mb-8">
        <em>What people tell us</em> is wrong.
      </TwoTone>

      <FeedbackList rows={list} />

      <p className="mt-8 text-[0.85rem] text-gray-mid max-w-2xl leading-relaxed">
        Feedback is its own channel, separate from the counselor. A student&apos;s
        conversation with the counselor is private and never appears here — this
        is only what someone deliberately sent to us.
      </p>
    </div>
  );
}
