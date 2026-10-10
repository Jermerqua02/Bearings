/* ————————————————————————————————————————
   Managing one account's Pro, from Admin › Users › Manage.

   An admin can see every grant the account has had, give a new one
   (starting today or later, ending on a date or never), change a grant's
   dates, end one now, and remove Pro altogether. Removing ends everything
   Lumni granted and blocks the account (pro_block), so Pro from a linked
   family member or an App Store purchase doesn't count for it either —
   until an admin restores it, or gives it Pro again.

   An App Store purchase is between the family and Apple: Lumni can't
   cancel or refund it, so its rows aren't edited here. The block is what
   stops it counting.

   Every change goes into account_event. The note is optional; who and when
   are always recorded.
   ———————————————————————————————————————— */

import "server-only";

import { and, desc, eq, gt, inArray, isNull, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { accountEvents, entitlements, parentStudentLinks, proBlocks, users } from "@/lib/db/schema";
import { UserFacingError } from "@/lib/actions/_error";
import { proStatus, proStatuses, type ProStatus } from "@/lib/entitlements";

const NOTE_MAX = 300;

function cleanNote(note?: string | null): string | null {
  const n = (note ?? "").trim();
  if (n.length > NOTE_MAX) throw new UserFacingError(`Keep the note under ${NOTE_MAX} characters.`);
  return n || null;
}

/** "2026-11-01" → the start of that day; empty → now. */
function startOf(day: string | null | undefined, now: Date): Date {
  if (!day) return now;
  const d = new Date(`${day}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) throw new UserFacingError("That start date isn't valid.");
  return d < now ? now : d;
}

/** "2026-11-01" → the end of that day (the last day of Pro); empty → no end. */
function endOf(day: string | null | undefined): Date | null {
  if (!day) return null;
  const d = new Date(`${day}T23:59:59.999Z`);
  if (Number.isNaN(d.getTime())) throw new UserFacingError("That end date isn't valid.");
  return d;
}

async function targetOf(userId: string) {
  const [u] = await db.select({ id: users.id, role: users.role }).from(users).where(eq(users.id, userId)).limit(1);
  if (!u) throw new UserFacingError("That account no longer exists.");
  return u;
}

/* ————— Reading ————— */

export type GrantState = "active" | "scheduled" | "ended" | "revoked";

export interface GrantRow {
  id: string;
  source: string;
  startsAt: string;
  endsAt: string | null;
  revokedAt: string | null;
  inTrial: boolean;
  productId: string | null;
  note: string | null;
  state: GrantState;
  /** Lumni can change this one — anything but an App Store purchase still running. */
  editable: boolean;
}

export interface ProDetail {
  role: string;
  status: { tier: "free" } | { tier: "pro"; source: string; endsAt: string | null; inTrial: boolean; via: "own" | "family" };
  block: { at: string; by: string | null; reason: string | null } | null;
  grants: GrantRow[];
  family: { email: string; role: string; pro: boolean }[];
}

function stateOf(e: typeof entitlements.$inferSelect, now: Date): GrantState {
  if (e.revokedAt) return "revoked";
  if (e.endsAt && e.endsAt <= now) return "ended";
  if (e.startsAt > now) return "scheduled";
  return "active";
}

function serialize(s: ProStatus): ProDetail["status"] {
  return s.tier === "free"
    ? { tier: "free" }
    : { tier: "pro", source: s.source, endsAt: s.endsAt?.toISOString() ?? null, inTrial: s.inTrial, via: s.via };
}

export async function proDetail(userId: string): Promise<ProDetail> {
  const target = await targetOf(userId);
  const now = new Date();
  const [status, [block], rows, links] = await Promise.all([
    proStatus(userId, target.role),
    db
      .select({ at: proBlocks.createdAt, by: users.email, reason: proBlocks.reason })
      .from(proBlocks)
      .leftJoin(users, eq(users.id, proBlocks.blockedBy))
      .where(eq(proBlocks.userId, userId))
      .limit(1),
    db.select().from(entitlements).where(eq(entitlements.userId, userId)).orderBy(desc(entitlements.startsAt)).limit(30),
    db
      .select({ studentId: parentStudentLinks.studentId, parentId: parentStudentLinks.parentId })
      .from(parentStudentLinks)
      .where(
        and(
          eq(parentStudentLinks.status, "active"),
          or(eq(parentStudentLinks.studentId, userId), eq(parentStudentLinks.parentId, userId)),
        ),
      ),
  ]);

  const otherIds = links.map((l) => (l.studentId === userId ? l.parentId : l.studentId)).filter((x): x is string => !!x);
  const others = otherIds.length
    ? await db.select({ id: users.id, email: users.email, role: users.role }).from(users).where(inArray(users.id, otherIds))
    : [];
  const otherPro = await proStatuses(others.map((o) => ({ userId: o.id, role: o.role })), now);

  return {
    role: target.role,
    status: serialize(status),
    block: block ? { at: block.at.toISOString(), by: block.by, reason: block.reason } : null,
    grants: rows.map((e) => {
      const state = stateOf(e, now);
      return {
        id: e.id,
        source: e.source,
        startsAt: e.startsAt.toISOString(),
        endsAt: e.endsAt?.toISOString() ?? null,
        revokedAt: e.revokedAt?.toISOString() ?? null,
        inTrial: e.inTrial,
        productId: e.productId,
        note: e.note,
        state,
        editable: e.source !== "app_store" && (state === "active" || state === "scheduled"),
      };
    }),
    family: others.map((o) => ({ email: o.email, role: o.role, pro: otherPro.get(o.id)?.tier === "pro" })),
  };
}

/* ————— Changing ————— */

/**
 * Give Pro from a day (today if blank) until a day (no end if blank).
 * Giving Pro is the admin saying this account should have it, so it also
 * lifts a removal.
 */
export async function grantPro(
  adminId: string,
  userId: string,
  input: { from?: string | null; until?: string | null; note?: string | null },
): Promise<void> {
  const target = await targetOf(userId);
  if (target.role === "admin") throw new UserFacingError("Admins have Pro by role — there's nothing to grant.");
  const note = cleanNote(input.note);
  const now = new Date();
  const startsAt = startOf(input.from, now);
  const endsAt = endOf(input.until);
  if (endsAt && endsAt <= now) throw new UserFacingError("The end date has to be in the future.");
  if (endsAt && endsAt <= startsAt) throw new UserFacingError("The end date has to be after the start.");

  await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(entitlements)
      .values({ userId, source: "admin", startsAt, endsAt, grantedBy: adminId, note })
      .returning({ id: entitlements.id });
    const lifted = await tx.delete(proBlocks).where(eq(proBlocks.userId, userId)).returning({ userId: proBlocks.userId });
    await tx.insert(accountEvents).values({
      userId,
      actorId: adminId,
      actorKind: "admin",
      action: "pro.granted",
      reason: note,
      detail: {
        entitlementId: row.id,
        source: "admin",
        startsAt: startsAt.toISOString(),
        endsAt: endsAt?.toISOString() ?? null,
        ...(lifted.length ? { restored: true } : {}),
      },
    });
  });
}

async function editableGrant(entitlementId: string) {
  const [e] = await db.select().from(entitlements).where(eq(entitlements.id, entitlementId)).limit(1);
  if (!e) throw new UserFacingError("That grant no longer exists.");
  if (e.source === "app_store") throw new UserFacingError("An App Store purchase can only be changed by Apple. Use Remove Pro to stop it counting.");
  const state = stateOf(e, new Date());
  if (state === "revoked" || state === "ended") throw new UserFacingError("That grant has already ended.");
  return e;
}

/** Change a grant's dates. Blank end: no end. */
export async function changeGrant(
  adminId: string,
  entitlementId: string,
  input: { from?: string | null; until?: string | null; note?: string | null },
): Promise<void> {
  const e = await editableGrant(entitlementId);
  const note = cleanNote(input.note);
  const now = new Date();
  // A grant that has started keeps its start; only a scheduled one moves.
  const startsAt = e.startsAt > now && input.from !== undefined ? startOf(input.from, now) : e.startsAt;
  const endsAt = endOf(input.until);
  if (endsAt && endsAt <= now) throw new UserFacingError("The end date has to be in the future — use End now to end it today.");
  if (endsAt && endsAt <= startsAt) throw new UserFacingError("The end date has to be after the start.");

  await db.transaction(async (tx) => {
    await tx.update(entitlements).set({ startsAt, endsAt, updatedAt: now }).where(eq(entitlements.id, e.id));
    await tx.insert(accountEvents).values({
      userId: e.userId,
      actorId: adminId,
      actorKind: "admin",
      action: "pro.changed",
      reason: note,
      detail: {
        entitlementId: e.id,
        source: e.source,
        startsAt: startsAt.toISOString(),
        endsAt: endsAt?.toISOString() ?? null,
        was: { startsAt: e.startsAt.toISOString(), endsAt: e.endsAt?.toISOString() ?? null },
      },
    });
  });
}

/** End one grant now. */
export async function endGrant(adminId: string, entitlementId: string, input: { note?: string | null }): Promise<void> {
  const e = await editableGrant(entitlementId);
  const note = cleanNote(input.note);
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx.update(entitlements).set({ revokedAt: now, updatedAt: now }).where(eq(entitlements.id, e.id));
    await tx.insert(accountEvents).values({
      userId: e.userId,
      actorId: adminId,
      actorKind: "admin",
      action: "pro.revoked",
      reason: note,
      detail: { entitlementIds: [e.id], sources: [e.source] },
    });
  });
}

/**
 * Take Pro away: end everything Lumni granted (running or scheduled) and
 * block the account, so a family member's Pro or an App Store purchase
 * doesn't count for it either. Returns whether an App Store purchase is
 * still running — the family is still paying Apple, and only Apple can
 * refund it.
 */
export async function removePro(adminId: string, userId: string, input: { note?: string | null }): Promise<{ appStoreActive: boolean }> {
  const target = await targetOf(userId);
  if (target.role === "admin") throw new UserFacingError("Admins have Pro by role — change their role first.");
  const note = cleanNote(input.note);
  const now = new Date();

  const live = await db
    .select()
    .from(entitlements)
    .where(and(eq(entitlements.userId, userId), isNull(entitlements.revokedAt), or(isNull(entitlements.endsAt), gt(entitlements.endsAt, now))));
  const ours = live.filter((e) => e.source !== "app_store");
  const apple = live.filter((e) => e.source === "app_store" && e.startsAt <= now);

  await db.transaction(async (tx) => {
    if (ours.length) {
      await tx.update(entitlements).set({ revokedAt: now, updatedAt: now }).where(inArray(entitlements.id, ours.map((e) => e.id)));
    }
    await tx
      .insert(proBlocks)
      .values({ userId, blockedBy: adminId, reason: note, createdAt: now })
      .onConflictDoUpdate({ target: proBlocks.userId, set: { blockedBy: adminId, reason: note, createdAt: now } });
    await tx.insert(accountEvents).values({
      userId,
      actorId: adminId,
      actorKind: "admin",
      action: "pro.removed",
      reason: note,
      detail: { entitlementIds: ours.map((e) => e.id), sources: ours.map((e) => e.source), appStoreActive: apple.length > 0 },
    });
  });
  return { appStoreActive: apple.length > 0 };
}

/** Undo a removal: whatever Pro the account would otherwise have counts again. */
export async function restorePro(adminId: string, userId: string, input: { note?: string | null }): Promise<void> {
  const note = cleanNote(input.note);
  await db.transaction(async (tx) => {
    const lifted = await tx.delete(proBlocks).where(eq(proBlocks.userId, userId)).returning({ userId: proBlocks.userId });
    if (!lifted.length) throw new UserFacingError("Pro wasn't removed from this account.");
    await tx.insert(accountEvents).values({ userId, actorId: adminId, actorKind: "admin", action: "pro.restored", reason: note });
  });
}
