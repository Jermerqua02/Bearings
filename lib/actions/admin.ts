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

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { adminSettings, feedback, users } from "@/lib/db/schema";
import { requireViewer } from "@/lib/auth/policy";
import { SELF_ASSIGNABLE_ROLES } from "@/lib/types";

export type ActionResult = { ok: true } | { ok: false; error: string };

async function requireAdmin() {
  const viewer = await requireViewer();
  if (viewer.role !== "admin") throw new Error("Not permitted");
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
    return { ok: false, error: err instanceof Error ? err.message : "Could not change the role." };
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
    return { ok: false, error: err instanceof Error ? err.message : "Could not delete." };
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
    return { ok: false, error: err instanceof Error ? err.message : "Could not save." };
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
    return { ok: false, error: err instanceof Error ? err.message : "Could not update." };
  }
}

export async function deleteFeedback(id: string): Promise<ActionResult> {
  try {
    await requireAdmin();
    await db.delete(feedback).where(eq(feedback.id, id));
    revalidatePath("/admin/feedback");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not delete." };
  }
}
