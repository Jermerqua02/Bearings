/* ————————————————————————————————————————
   Budget alerts.

   Thresholds and recipients were storable and visible on the cost page,
   but nothing ever evaluated them — the settings existed and the email
   never came. This is the part that fires.

   Two rules keep it from becoming noise:

   1. One alert per threshold per month. lastAlertThreshold records the
      highest threshold already sent this billing month, so crossing 80%
      alerts once rather than on every check for the rest of the month.

   2. The highest threshold crossed wins. If spend jumps past both 80% and
      100% between checks, that is one email about being over budget, not
      two.

   Never throws. This runs unattended, and a failure here should show up in
   logs rather than take down whatever invoked it.
   ———————————————————————————————————————— */

import "server-only";

import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { adminSettings, users } from "@/lib/db/schema";
import { budgetAlertEmail, sendEmail } from "@/lib/email";
import { spendThisMonth } from "@/lib/db/queries/admin";
import { usdFromMillicents } from "@/lib/costs";
import { railwayCost } from "@/lib/railway";

export interface AlertOutcome {
  checked: true;
  spentUsd: number;
  budgetUsd: number;
  percent: number;
  /** The threshold this run sent for, or null when nothing was due. */
  firedThreshold: number | null;
  reason: string;
  recipients: string[];
}

export async function checkBudgetAndAlert(): Promise<AlertOutcome> {
  const [settings] = await db
    .select()
    .from(adminSettings)
    .where(eq(adminSettings.id, "singleton"))
    .limit(1);

  const budgetUsd = settings?.monthlyBudgetUsd ?? 25;
  const thresholds = [...(settings?.alertThresholds ?? [80, 100])].sort((a, b) => a - b);

  const [aiMillicents, infra] = await Promise.all([spendThisMonth(), railwayCost()]);
  const spentUsd = usdFromMillicents(aiMillicents) + (infra.configured ? infra.projectedUsd : 0);
  const percent = budgetUsd > 0 ? (spentUsd / budgetUsd) * 100 : 0;

  const base = { checked: true as const, spentUsd, budgetUsd, percent, recipients: [] as string[] };

  if (settings && !settings.alertsEnabled) {
    return { ...base, firedThreshold: null, reason: "alerts are switched off" };
  }

  // Reset the ledger when the billing month rolls over, so August's alerts
  // don't suppress September's.
  const now = new Date();
  const last = settings?.lastAlertAt ? new Date(settings.lastAlertAt) : null;
  const sameMonth =
    last !== null &&
    last.getUTCFullYear() === now.getUTCFullYear() &&
    last.getUTCMonth() === now.getUTCMonth();
  const alreadySent = sameMonth ? (settings?.lastAlertThreshold ?? 0) : 0;

  // Highest threshold we've crossed and not yet reported.
  const due = thresholds.filter((t) => percent >= t && t > alreadySent);
  if (due.length === 0) {
    return {
      ...base,
      firedThreshold: null,
      reason:
        thresholds.length === 0
          ? "no thresholds configured"
          : `at ${percent.toFixed(1)}% — nothing new crossed`,
    };
  }
  const threshold = due[due.length - 1]!;

  const configured = settings?.alertEmail?.trim();
  const recipients = configured
    ? [configured]
    : (await db.select({ email: users.email }).from(users).where(eq(users.role, "admin"))).map(
        (a) => a.email,
      );

  if (recipients.length === 0) {
    return { ...base, firedThreshold: null, reason: "no recipients — no admins and no alert email set" };
  }

  const mail = budgetAlertEmail({
    threshold,
    spentUsd,
    budgetUsd,
    adminUrl: `${process.env.BETTER_AUTH_URL ?? ""}/admin/usage`,
  });

  const results = await Promise.all(
    recipients.map((to) => sendEmail({ ...mail, to })),
  );
  const delivered = results.filter(Boolean).length;

  if (delivered === 0) {
    // Don't record it as sent — otherwise a provider outage silently
    // consumes the one alert this threshold was ever going to get.
    //
    // This only catches synchronous rejections: an address the provider
    // accepts and bounces afterwards counts as delivered here, and the
    // threshold is marked sent. Catching those needs delivery webhooks,
    // which we don't have.
    return {
      ...base,
      firedThreshold: null,
      recipients,
      reason: "every send failed — not recording, will retry next run",
    };
  }

  await db
    .insert(adminSettings)
    .values({
      id: "singleton",
      monthlyBudgetUsd: budgetUsd,
      alertThresholds: thresholds,
      lastAlertAt: now,
      lastAlertThreshold: threshold,
    })
    .onConflictDoUpdate({
      target: adminSettings.id,
      set: { lastAlertAt: now, lastAlertThreshold: threshold, updatedAt: now },
    });

  return {
    ...base,
    firedThreshold: threshold,
    recipients,
    reason: `sent ${threshold}% alert to ${delivered} of ${recipients.length}`,
  };
}
