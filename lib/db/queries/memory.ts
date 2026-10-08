/* ————————————————————————————————————————
   Counselor memory — reads and writes, scoped to the student.

   Reads go through the policy like every other slice ("counselorMemory" is
   student-private). Writes take the student id from the caller's own
   verified session, never from input.
   ———————————————————————————————————————— */

import "server-only";

import { and, asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { counselorMemories } from "@/lib/db/schema";
import { assertCanRead, type Viewer } from "@/lib/auth/policy";
import { MAX_MEMORIES, isMemoryCategory, type MemoryFact } from "@/lib/memory";

type Row = typeof counselorMemories.$inferSelect;

function toFact(r: Row): MemoryFact | null {
  if (!isMemoryCategory(r.category)) return null;
  return {
    id: r.id,
    category: r.category,
    fact: r.fact,
    source: r.source === "student" ? "student" : "chat",
    createdAt: r.createdAt.toISOString(),
  };
}

export async function getMemories(viewer: Viewer, studentId: string): Promise<MemoryFact[]> {
  await assertCanRead(viewer, "counselorMemory", studentId);
  return rawMemories(studentId);
}

/** Without a policy check — only for code already acting as the student. */
export async function rawMemories(studentId: string): Promise<MemoryFact[]> {
  const rows = await db
    .select()
    .from(counselorMemories)
    .where(eq(counselorMemories.studentId, studentId))
    .orderBy(asc(counselorMemories.createdAt));
  return rows.map(toFact).filter((f): f is MemoryFact => f !== null);
}

export async function addMemories(
  studentId: string,
  facts: { category: string; fact: string }[],
  source: "chat" | "student",
  threadId: string | null = null,
): Promise<MemoryFact[]> {
  const valid = facts.filter((f) => isMemoryCategory(f.category) && f.fact.trim());
  if (!valid.length) return [];
  const existing = await rawMemories(studentId);
  // Never let the notes grow without bound; the oldest chat-sourced ones
  // give way first, never what the student typed themselves.
  const overflow = existing.length + valid.length - MAX_MEMORIES;
  if (overflow > 0) {
    const victims = existing.filter((f) => f.source === "chat").slice(0, overflow);
    for (const v of victims) {
      await db.delete(counselorMemories).where(eq(counselorMemories.id, v.id));
    }
  }
  const seen = new Set(existing.map((f) => f.fact.toLowerCase()));
  const fresh = valid.filter((f) => !seen.has(f.fact.trim().toLowerCase()));
  if (!fresh.length) return [];
  const rows = await db
    .insert(counselorMemories)
    .values(fresh.map((f) => ({ studentId, category: f.category, fact: f.fact.trim(), source, threadId })))
    .returning();
  return rows.map(toFact).filter((f): f is MemoryFact => f !== null);
}

export async function updateMemory(
  studentId: string,
  id: string,
  patch: { fact?: string; category?: string },
): Promise<boolean> {
  const set: Partial<typeof counselorMemories.$inferInsert> = { updatedAt: new Date() };
  if (patch.fact !== undefined) set.fact = patch.fact.trim();
  if (patch.category !== undefined && isMemoryCategory(patch.category)) set.category = patch.category;
  const rows = await db
    .update(counselorMemories)
    .set(set)
    .where(and(eq(counselorMemories.id, id), eq(counselorMemories.studentId, studentId)))
    .returning({ id: counselorMemories.id });
  return rows.length > 0;
}

export async function deleteMemory(studentId: string, id: string): Promise<boolean> {
  const rows = await db
    .delete(counselorMemories)
    .where(and(eq(counselorMemories.id, id), eq(counselorMemories.studentId, studentId)))
    .returning({ id: counselorMemories.id });
  return rows.length > 0;
}
