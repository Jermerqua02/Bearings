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

import { desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { accountEvents, adminSettings, feedback, schoolLeads, users } from "@/lib/db/schema";
import { decideFreeAccess } from "@/lib/free-access";
import { createSchoolLicense, revokeSchoolLicense } from "@/lib/school-licenses";
import { changeGrant, endGrant, grantPro as grantProFor, proDetail, removePro, restorePro, type ProDetail } from "@/lib/pro-admin";
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

/* Thin wrappers over lib/pro-admin.ts, which holds the rules (and is what
   scripts/test-pro-admin.ts tests). Each re-checks the role. */

type Dates = { from?: string | null; until?: string | null; note?: string | null };

export async function proDetailAction(userId: string): Promise<{ ok: true; detail: ProDetail } | { ok: false; error: string }> {
  try {
    await requireAdmin();
    return { ok: true, detail: await proDetail(userId) };
  } catch (err) {
    return { ok: false, error: safeError("admin", err, "Could not load this account.") };
  }
}

export async function grantPro(userId: string, input: Dates): Promise<ActionResult> {
  try {
    const admin = await requireAdmin();
    await grantProFor(admin.userId, userId, input);
    revalidatePath("/admin/users");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: safeError("admin", err, "Could not grant Pro.") };
  }
}

export async function changeGrantAction(entitlementId: string, input: Dates): Promise<ActionResult> {
  try {
    const admin = await requireAdmin();
    await changeGrant(admin.userId, entitlementId, input);
    revalidatePath("/admin/users");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: safeError("admin", err, "Could not change that grant.") };
  }
}

export async function endGrantAction(entitlementId: string, input: { note?: string | null }): Promise<ActionResult> {
  try {
    const admin = await requireAdmin();
    await endGrant(admin.userId, entitlementId, input);
    revalidatePath("/admin/users");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: safeError("admin", err, "Could not end that grant.") };
  }
}

export async function removeProAction(
  userId: string,
  input: { note?: string | null },
): Promise<{ ok: true; appStoreActive: boolean } | { ok: false; error: string }> {
  try {
    const admin = await requireAdmin();
    const { appStoreActive } = await removePro(admin.userId, userId, input);
    revalidatePath("/admin/users");
    return { ok: true, appStoreActive };
  } catch (err) {
    return { ok: false, error: safeError("admin", err, "Could not remove Pro.") };
  }
}

export async function restoreProAction(userId: string, input: { note?: string | null }): Promise<ActionResult> {
  try {
    const admin = await requireAdmin();
    await restorePro(admin.userId, userId, input);
    revalidatePath("/admin/users");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: safeError("admin", err, "Could not restore Pro.") };
  }
}

export interface AccountEventRow {
  at: string;
  action: string;
  actor: string;
  reason: string | null;
  startsAt: string | null;
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
        startsAt: ((r.detail as { startsAt?: string | null } | null)?.startsAt) ?? null,
        endsAt: ((r.detail as { endsAt?: string | null } | null)?.endsAt) ?? null,
      })),
    };
  } catch (err) {
    return { ok: false, error: safeError("admin", err, "Could not load the history.") };
  }
}

/* ————————————— Free access and schools ————————————— */

export async function decideFreeAccessAction(requestId: string, input: { approve: boolean; note?: string }): Promise<ActionResult> {
  try {
    const admin = await requireAdmin();
    await decideFreeAccess(admin.userId, requestId, input);
    revalidatePath("/admin/access");
    revalidatePath("/admin/users");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: safeError("admin", err, "Could not record the decision.") };
  }
}

export async function setLeadStatusAction(leadId: string, status: string, notes?: string): Promise<ActionResult> {
  try {
    await requireAdmin();
    const allowed = ["new", "contacted", "piloting", "customer", "closed"] as const;
    if (!allowed.includes(status as (typeof allowed)[number])) return { ok: false, error: "Unknown status." };
    await db
      .update(schoolLeads)
      .set({ status: status as (typeof allowed)[number], ...(notes !== undefined ? { notes: notes.slice(0, 2000) } : {}), updatedAt: new Date() })
      .where(eq(schoolLeads.id, leadId));
    revalidatePath("/admin/schools");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: safeError("admin", err, "Could not update the inquiry.") };
  }
}

export async function createLicenseAction(input: {
  orgName: string;
  contactEmail?: string;
  seats: number;
  endsAt: string;
  priceDollars?: string;
  invoiceStatus?: string;
  leadId?: string | null;
  notes?: string;
}): Promise<{ ok: true; code: string } | { ok: false; error: string }> {
  try {
    const admin = await requireAdmin();
    const price = input.priceDollars?.trim() ? Math.round(Number(input.priceDollars) * 100) : null;
    if (price !== null && (!Number.isFinite(price) || price < 0)) return { ok: false, error: "Price per seat must be a number." };
    const { code } = await createSchoolLicense(admin.userId, { ...input, priceCents: price });
    revalidatePath("/admin/schools");
    return { ok: true, code };
  } catch (err) {
    return { ok: false, error: safeError("admin", err, "Could not create the license.") };
  }
}

export async function revokeLicenseAction(licenseId: string): Promise<ActionResult> {
  try {
    const admin = await requireAdmin();
    await revokeSchoolLicense(admin.userId, licenseId);
    revalidatePath("/admin/schools");
    revalidatePath("/admin/users");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: safeError("admin", err, "Could not end the license.") };
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
