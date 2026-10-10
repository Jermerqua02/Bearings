/* ————————————————————————————————————————
   Admin server actions.

   Every export here re-checks the role. The layout guard at
   app/admin/layout.tsx protects the *pages*, but a server action is its own
   endpoint reachable by anyone who knows its id — a guard on the surface
   that renders the button is not a guard on the button.

   Destructive actions are narrow on purpose: an admin can change roles and
   delete accounts, and cannot read or edit student content from here.
   ———————————————————————————————————————— */

"use server";

import { desc, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { accountEvents, adminSettings, entitlements, feedback, users } from "@/lib/db/schema";
import { ownActiveEntitlements, proStatus } from "@/lib/entitlements";
import { AuthzError, requireViewer } from "@/lib/auth/policy";
import { safeError } from "@/lib/actions/_error";
import { SELF_ASSIGNABLE_ROLES } from "@/lib/types";

export type ActionResult = { ok: true } | { ok: false; error: string };

async function requireAdmin() {
  const viewer = await requireViewer();
  // AuthzError rather than a bare Error: safeError passes these through to
  // the user, and "Not permitted" is more use than "Could not save."
  if (viewer.role !== "admin") throw new AuthzError("Not permitted");
  return viewer;
}

/* ————————————— Users ————————————— */

export async function setUserRole(userId: string, role: string): Promise<ActionResult> {
  try {
    const viewer = await requireAdmin();

    // Admin is grantable here, unlike at signup — but only by someone who
    // already is one, which is the distinction that matters.
    const allowed = [...SELF_ASSIGNABLE_ROLES, "admin"];
    if (!allowed.includes(role)) return { ok: false, error: "Unknown role." };

    // Don't let an admin strip their own access and lock everyone out of
    // the portal by accident.
    if (userId === viewer.userId && role !== "admin") {
      const admins = await db.select({ id: users.id }).from(users).where(eq(users.role, "admin"));
      if (admins.length <= 1) {
        return { ok: false, error: "You're the only admin — promote someone else first." };
      }
    }

    await db
      .update(users)
      .set({ role: role as "student" | "parent" | "admin", updatedAt: new Date() })
      .where(eq(users.id, userId));

    revalidatePath("/admin/users");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: safeError("admin", err, "Could not change the role.") };
  }
}

export async function deleteUser(userId: string): Promise<ActionResult> {
  try {
    const viewer = await requireAdmin();
    if (userId === viewer.userId) {
      return { ok: false, error: "You can't delete your own account from here." };
    }

    // Every child table cascades from user, so this removes their content
    // too — which is the point, and why it is the only destructive action.
    await db.delete(users).where(eq(users.id, userId));

    revalidatePath("/admin/users");
    revalidatePath("/admin/usage");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: safeError("admin", err, "Could not delete.") };
  }
}

/* ————————————— Pro ————————————— */

const REASON_MAX = 300;

function cleanReason(reason: string): string | null {
  const r = reason.trim();
  return r && r.length <= REASON_MAX ? r : null;
}

/**
 * Give an account Pro, until a date or with no end. A reason is required:
 * it's what the history shows when someone later asks why this account
 * has Pro ("beta tester", "school pilot", "free access approved").
 */
export async function grantPro(
  userId: string,
  input: { until: string | null; reason: string },
): Promise<ActionResult> {
  try {
    const admin = await requireAdmin();
    const reason = cleanReason(input.reason);
    if (!reason) return { ok: false, error: `Give a reason (up to ${REASON_MAX} characters).` };

    let endsAt: Date | null = null;
    if (input.until) {
      // A date from the form is the last day of Pro, through its end.
      endsAt = new Date(`${input.until}T23:59:59.999Z`);
      if (Number.isNaN(endsAt.getTime())) return { ok: false, error: "That end date isn't valid." };
      if (endsAt.getTime() <= Date.now()) return { ok: false, error: "The end date has to be in the future." };
    }

    const [target] = await db.select({ id: users.id }).from(users).where(eq(users.id, userId)).limit(1);
    if (!target) return { ok: false, error: "That account no longer exists." };

    await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(entitlements)
        .values({ userId, source: "admin", endsAt, grantedBy: admin.userId, note: reason })
        .returning({ id: entitlements.id });
      await tx.insert(accountEvents).values({
        userId,
        actorId: admin.userId,
        actorKind: "admin",
        action: "pro.granted",
        reason,
        detail: { entitlementId: row.id, source: "admin", endsAt: endsAt?.toISOString() ?? null },
      });
    });

    revalidatePath("/admin/users");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: safeError("admin", err, "Could not grant Pro.") };
  }
}

/**
 * End an account's Pro now. Only what Lumni granted can be ended here: an
 * App Store purchase is between the family and Apple — Lumni can't cancel
 * or refund it, and the next notification from Apple would restore it — so
 * those are left in place and the admin is told so.
 */
export async function revokePro(userId: string, input: { reason: string }): Promise<ActionResult> {
  try {
    const admin = await requireAdmin();
    const reason = cleanReason(input.reason);
    if (!reason) return { ok: false, error: `Give a reason (up to ${REASON_MAX} characters).` };

    const own = await ownActiveEntitlements(userId);
    const ours = own.filter((e) => e.source !== "app_store");
    const apple = own.filter((e) => e.source === "app_store");

    if (ours.length === 0) {
      if (apple.length > 0) {
        return { ok: false, error: "Their Pro is an App Store purchase — only Apple or they can cancel or refund it (App Store Connect)." };
      }
      const status = await proStatus(userId);
      if (status.tier === "pro" && status.via === "family") {
        return { ok: false, error: "Their Pro is shared from a linked parent or student — revoke it on that account." };
      }
      return { ok: false, error: "This account doesn't have Pro to revoke." };
    }

    const now = new Date();
    await db.transaction(async (tx) => {
      await tx.update(entitlements).set({ revokedAt: now, updatedAt: now }).where(inArray(entitlements.id, ours.map((e) => e.id)));
      await tx.insert(accountEvents).values({
        userId,
        actorId: admin.userId,
        actorKind: "admin",
        action: "pro.revoked",
        reason,
        detail: { entitlementIds: ours.map((e) => e.id), sources: ours.map((e) => e.source) },
      });
    });

    revalidatePath("/admin/users");
    return apple.length > 0
      ? { ok: false, error: "Revoked what Lumni granted. They still have an App Store purchase, which only Apple or they can cancel." }
      : { ok: true };
  } catch (err) {
    return { ok: false, error: safeError("admin", err, "Could not revoke Pro.") };
  }
}

export interface AccountEventRow {
  at: string;
  action: string;
  actor: string;
  reason: string | null;
  endsAt: string | null;
}

/** An account's history, newest first. */
export async function accountHistory(
  userId: string,
): Promise<{ ok: true; events: AccountEventRow[] } | { ok: false; error: string }> {
  try {
    await requireAdmin();
    const rows = await db
      .select({
        createdAt: accountEvents.createdAt,
        action: accountEvents.action,
        actorKind: accountEvents.actorKind,
        actorEmail: users.email,
        reason: accountEvents.reason,
        detail: accountEvents.detail,
      })
      .from(accountEvents)
      .leftJoin(users, eq(users.id, accountEvents.actorId))
      .where(eq(accountEvents.userId, userId))
      .orderBy(desc(accountEvents.createdAt))
      .limit(50);
    return {
      ok: true,
      events: rows.map((r) => ({
        at: r.createdAt.toISOString(),
        action: r.action,
        actor: r.actorEmail ?? r.actorKind,
        reason: r.reason,
        endsAt: ((r.detail as { endsAt?: string | null } | null)?.endsAt) ?? null,
      })),
    };
  } catch (err) {
    return { ok: false, error: safeError("admin", err, "Could not load the history.") };
  }
}

/* ————————————— Cost budget ————————————— */

export async function saveBudget(input: {
  monthlyBudgetUsd: number;
  alertThresholds: number[];
  alertEmail: string;
  alertsEnabled: boolean;
}): Promise<ActionResult> {
  try {
    await requireAdmin();

    if (!Number.isFinite(input.monthlyBudgetUsd) || input.monthlyBudgetUsd < 0) {
      return { ok: false, error: "Budget must be a positive number." };
    }
    const thresholds = input.alertThresholds
      .filter((n) => Number.isFinite(n) && n > 0 && n <= 1000)
      .sort((a, b) => a - b);
    if (thresholds.length === 0) {
      return { ok: false, error: "Give at least one alert threshold, e.g. 80." };
    }

    await db
      .insert(adminSettings)
      .values({
        id: "singleton",
        monthlyBudgetUsd: Math.round(input.monthlyBudgetUsd),
        alertThresholds: thresholds,
        alertEmail: input.alertEmail.trim(),
        alertsEnabled: input.alertsEnabled,
      })
      .onConflictDoUpdate({
        target: adminSettings.id,
        set: {
          monthlyBudgetUsd: Math.round(input.monthlyBudgetUsd),
          alertThresholds: thresholds,
          alertEmail: input.alertEmail.trim(),
          alertsEnabled: input.alertsEnabled,
          updatedAt: new Date(),
        },
      });

    revalidatePath("/admin/usage");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: safeError("admin", err, "Could not save.") };
  }
}

/* ————————————— Feedback ————————————— */

export async function setFeedbackStatus(
  id: string,
  status: "open" | "resolved",
): Promise<ActionResult> {
  try {
    await requireAdmin();
    await db
      .update(feedback)
      .set({
        status,
        resolvedAt: status === "resolved" ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(eq(feedback.id, id));
    revalidatePath("/admin/feedback");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: safeError("admin", err, "Could not update.") };
  }
}

export async function deleteFeedback(id: string): Promise<ActionResult> {
  try {
    await requireAdmin();
    await db.delete(feedback).where(eq(feedback.id, id));
    revalidatePath("/admin/feedback");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: safeError("admin", err, "Could not delete.") };
  }
}
