/* ————————————————————————————————————————
   Pro status: does this account have Pro right now, and why?

   Every check goes through here (docs/plans/lumni-pro.md). An account has
   Pro when an entitlement row covers now — its own, or one held by the
   other side of an active parent link: Pro belongs to the family, so
   whoever bought it, the linked student and parent both have it.

   Admins have Pro by role ("staff"), so the people running Lumni see what
   a paying family sees without granting themselves anything.

   An account an admin has removed Pro from (pro_block) is Free whatever
   else is true — its own rows, a linked family member's, an App Store
   purchase. Its own rows still share to its linked family: the block is
   about this account, not the people linked to it.

   Reads only. Granting and revoking are admin actions (lib/actions/
   admin.ts), purchases arrive from the App Store — both write rows that
   this then reads.
   ———————————————————————————————————————— */

import "server-only";

import { and, count, eq, gt, inArray, isNull, lte, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { aiUsage, entitlements, listEntries, parentStudentLinks, proBlocks, schools, users } from "@/lib/db/schema";
import { ProRequired } from "@/lib/actions/_error";

export type ProSource = "app_store" | "admin" | "free_access" | "school" | "staff";

export type ProStatus =
  | { tier: "free" }
  | {
      tier: "pro";
      source: ProSource;
      /** Null: no end date. */
      endsAt: Date | null;
      /** In an App Store introductory offer that hasn't converted. */
      inTrial: boolean;
      /** Held by this account, or shared from a linked parent or student. */
      via: "own" | "family";
    };

type Row = typeof entitlements.$inferSelect;

/** Entitlements covering `now`, for the given holders. */
async function activeFor(holderIds: string[], now: Date): Promise<Row[]> {
  if (holderIds.length === 0) return [];
  return db
    .select()
    .from(entitlements)
    .where(
      and(
        inArray(entitlements.userId, holderIds),
        isNull(entitlements.revokedAt),
        lte(entitlements.startsAt, now),
        or(isNull(entitlements.endsAt), gt(entitlements.endsAt, now)),
      ),
    );
}

/** Everyone across an active link from each of these accounts. */
async function familyOf(userIds: string[]): Promise<Map<string, string[]>> {
  const family = new Map<string, string[]>(userIds.map((id) => [id, []]));
  if (userIds.length === 0) return family;
  const links = await db
    .select({ studentId: parentStudentLinks.studentId, parentId: parentStudentLinks.parentId })
    .from(parentStudentLinks)
    .where(
      and(
        eq(parentStudentLinks.status, "active"),
        or(inArray(parentStudentLinks.studentId, userIds), inArray(parentStudentLinks.parentId, userIds)),
      ),
    );
  for (const l of links) {
    if (!l.parentId) continue;
    family.get(l.studentId)?.push(l.parentId);
    family.get(l.parentId)?.push(l.studentId);
  }
  return family;
}

/**
 * The entitlement that best describes someone's Pro: their own before a
 * family member's, then no end date before a dated one, then the latest end.
 */
function best(rows: Row[], ownerId: string): Row | undefined {
  return [...rows].sort((a, b) => {
    const own = Number(b.userId === ownerId) - Number(a.userId === ownerId);
    if (own) return own;
    if (!a.endsAt !== !b.endsAt) return a.endsAt ? 1 : -1;
    return (b.endsAt?.getTime() ?? 0) - (a.endsAt?.getTime() ?? 0);
  })[0];
}

function statusFrom(row: Row | undefined, ownerId: string): ProStatus {
  if (!row) return { tier: "free" };
  return {
    tier: "pro",
    source: row.source,
    endsAt: row.endsAt,
    inTrial: row.inTrial,
    via: row.userId === ownerId ? "own" : "family",
  };
}

/** Pro status for one account. Pass the role when it's known, to skip a lookup. */
export async function proStatus(userId: string, role?: string): Promise<ProStatus> {
  if (role === undefined) {
    const [u] = await db.select({ role: users.role }).from(users).where(eq(users.id, userId)).limit(1);
    role = u?.role ?? "student";
  }
  if (role === "admin") return { tier: "pro", source: "staff", endsAt: null, inTrial: false, via: "own" };
  return (await proStatuses([{ userId, role }])).get(userId) ?? { tier: "free" };
}

export const isPro = (s: ProStatus) => s.tier === "pro";

/* ————— What Free can do ————— */

/**
 * The counselor, once: two messages — enough to meet her, not to rely on
 * her. Interview practice has no free sample. Counted over the account's
 * lifetime from ai_usage, the way rate limits count — no separate counter
 * to drift.
 */
export const FREE_SAMPLE = { chat: 2, interview: 0 } as const;

/**
 * Free's directory: the 40 schools written up by hand (`school.curated`) —
 * well-known, and the fullest data — plus any school already on the
 * student's own list. Pro opens every school.
 */
export const FREE_DIRECTORY = "curated" as const;

/** Whether a Free account may open this school: one of the 40, or on their list. */
export async function inFreeDirectory(userId: string, schoolId: string): Promise<boolean> {
  const [row] = await db
    .select({ curated: schools.curated, listed: listEntries.schoolId })
    .from(schools)
    .leftJoin(listEntries, and(eq(listEntries.schoolId, schools.id), eq(listEntries.studentId, userId)))
    .where(eq(schools.id, schoolId))
    .limit(1);
  return !!row && (row.curated || row.listed !== null);
}

/** Free lists hold this many schools. */
export const FREE_LIST_LIMIT = 5;

/** AI features a Free account can't use at all — everything but the sample. */
const PRO_ONLY = new Set(["greet", "why_school", "essay_feedback", "throughline", "summarize", "transcript", "memory"]);

export async function sampleLeft(userId: string): Promise<{ chat: number; interview: number }> {
  const rows = await db
    .select({ feature: aiUsage.feature, n: count() })
    .from(aiUsage)
    .where(and(eq(aiUsage.userId, userId), inArray(aiUsage.feature, ["chat", "interview"])))
    .groupBy(aiUsage.feature);
  const used = Object.fromEntries(rows.map((r) => [r.feature, r.n]));
  return {
    chat: Math.max(0, FREE_SAMPLE.chat - (used.chat ?? 0)),
    interview: Math.max(0, FREE_SAMPLE.interview - (used.interview ?? 0)),
  };
}

/**
 * Throw ProRequired unless this account may use this AI feature now: Pro
 * may use anything; Free only the sample, while it lasts. Features not
 * named here (titles, speech for the sample's interview) are allowed.
 */
export async function assertFeature(userId: string, feature: string): Promise<void> {
  if (isPro(await proStatus(userId))) return;
  if (PRO_ONLY.has(feature)) throw new ProRequired();
  if (feature === "chat" || feature === "interview") {
    const left = await sampleLeft(userId);
    if (left[feature] > 0) return;
    throw new ProRequired(
      feature === "chat"
        ? "That's the end of your free messages with the counselor. Pro lets you keep talking."
        : "That's the end of your free interview practice. Pro lets you keep going.",
    );
  }
}

/** Whether an admin has removed Pro from this account. */
export async function proRemoved(userId: string): Promise<boolean> {
  return (await blockedOf([userId])).has(userId);
}

/** Accounts an admin has removed Pro from, of these. */
async function blockedOf(userIds: string[]): Promise<Set<string>> {
  if (userIds.length === 0) return new Set();
  const rows = await db.select({ userId: proBlocks.userId }).from(proBlocks).where(inArray(proBlocks.userId, userIds));
  return new Set(rows.map((r) => r.userId));
}

/** What the app needs to know about an account's plan. */
export async function planFor(userId: string, role: string) {
  const status = await proStatus(userId, role);
  if (isPro(status)) {
    const s = status as Extract<ProStatus, { tier: "pro" }>;
    return { tier: "pro" as const, source: s.source, endsAt: s.endsAt?.toISOString() ?? null, inTrial: s.inTrial, via: s.via, sample: null, blocked: false };
  }
  // Removed by an admin: the app hides the purchase buttons, since a
  // purchase couldn't give them Pro.
  const blocked = await proRemoved(userId);
  return { tier: "free" as const, source: null, endsAt: null, inTrial: false, via: null, sample: await sampleLeft(userId), blocked };
}

/** Pro status for many accounts at once — the admin roster — in three queries. */
export async function proStatuses(accounts: { userId: string; role: string }[], now = new Date()) {
  const ids = accounts.map((a) => a.userId);
  const family = await familyOf(ids);
  const holders = [...new Set([...ids, ...[...family.values()].flat()])];
  const [rows, blocked] = await Promise.all([activeFor(holders, now), blockedOf(ids)]);

  const out = new Map<string, ProStatus>();
  for (const { userId, role } of accounts) {
    if (role === "admin") {
      out.set(userId, { tier: "pro", source: "staff", endsAt: null, inTrial: false, via: "own" });
      continue;
    }
    if (blocked.has(userId)) {
      out.set(userId, { tier: "free" });
      continue;
    }
    const mine = new Set([userId, ...(family.get(userId) ?? [])]);
    out.set(userId, statusFrom(best(rows.filter((r) => mine.has(r.userId)), userId), userId));
  }
  return out;
}

/** An account's own entitlements that cover now — what revoking would end. */
export async function ownActiveEntitlements(userId: string, now = new Date()): Promise<Row[]> {
  return activeFor([userId], now);
}
