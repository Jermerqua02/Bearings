/* ————————————————————————————————————————
   Pro status: does this account have Pro right now, and why?

   Every check goes through here (docs/plans/lumni-pro.md). An account has
   Pro when an entitlement row covers now — its own, or one held by the
   other side of an active parent link: Pro belongs to the family, so
   whoever bought it, the linked student and parent both have it.

   Admins have Pro by role ("staff"), so the people running Lumni see what
   a paying family sees without granting themselves anything.

   Reads only. Granting and revoking are admin actions (lib/actions/
   admin.ts), purchases arrive from the App Store — both write rows that
   this then reads.
   ———————————————————————————————————————— */

import "server-only";

import { and, eq, gt, inArray, isNull, lte, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { entitlements, parentStudentLinks } from "@/lib/db/schema";

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

/** Pro status for one account. Pass the role when it's known, to skip a lookup for admins. */
export async function proStatus(userId: string, role?: string): Promise<ProStatus> {
  if (role === "admin") return { tier: "pro", source: "staff", endsAt: null, inTrial: false, via: "own" };
  return (await proStatuses([{ userId, role: role ?? "student" }])).get(userId) ?? { tier: "free" };
}

/** Pro status for many accounts at once — the admin roster — in two queries. */
export async function proStatuses(accounts: { userId: string; role: string }[], now = new Date()) {
  const ids = accounts.map((a) => a.userId);
  const family = await familyOf(ids);
  const holders = [...new Set([...ids, ...[...family.values()].flat()])];
  const rows = await activeFor(holders, now);

  const out = new Map<string, ProStatus>();
  for (const { userId, role } of accounts) {
    if (role === "admin") {
      out.set(userId, { tier: "pro", source: "staff", endsAt: null, inTrial: false, via: "own" });
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
