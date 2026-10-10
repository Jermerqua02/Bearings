import "server-only";

import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { counselorThreads } from "@/lib/db/schema";
import { requireViewer } from "@/lib/auth/policy";
import { NotFound, uuid } from "@/lib/api/v1";

/**
 * Refuse a thread id the caller doesn't own, before any action touches it.
 *
 * chatAction checks this itself; greetAction does not, and would write a
 * greeting into whichever thread it was handed. Checking here keeps the API
 * closed regardless of which action is underneath.
 */
export async function requireOwnThread(id: string): Promise<string> {
  // A student's or a parent's — each has their own conversations.
  const s = await requireViewer();
  const [row] = await db
    .select({ id: counselorThreads.id })
    .from(counselorThreads)
    .where(and(eq(counselorThreads.id, uuid(id)), eq(counselorThreads.studentId, s.userId)))
    .limit(1);
  if (!row) throw new NotFound();
  return row.id;
}
