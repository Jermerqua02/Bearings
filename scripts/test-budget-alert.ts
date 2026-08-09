/* Budget alert logic test. Run: npm run test:budget */
import "./_env";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { adminSettings, aiUsage, users } from "@/lib/db/schema";
import { checkBudgetAndAlert } from "@/lib/budget-alert";

let failures = 0;
const check = (label: string, ok: boolean, detail?: string) => {
  console.log(ok ? `  ✓ ${label}` : `  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
};

async function setSettings(patch: Record<string, unknown>) {
  await db.insert(adminSettings)
    .values({ id: "singleton", monthlyBudgetUsd: 25, alertThresholds: [80, 100], ...patch })
    .onConflictDoUpdate({ target: adminSettings.id, set: { ...patch, updatedAt: new Date() } });
}

const SEED_USER = "budget-alert-test-user";

async function main() {
  console.log("\nBudget alerts\n");
  const [original] = await db.select().from(adminSettings).where(eq(adminSettings.id, "singleton"));

  // Crossing a threshold has to be forced with real spend — a small budget
  // isn't enough on its own, because actual month-to-date spend may be
  // pennies. $5 of recorded usage against a $1 budget is unambiguous.
  await db.delete(users).where(eq(users.id, SEED_USER));
  await db.insert(users).values({
    id: SEED_USER, name: "Budget Test",
    email: "budget-alert-test@northstar.invalid", role: "student",
  });
  await db.insert(aiUsage).values({
    userId: SEED_USER, feature: "chat", model: "claude-opus-5",
    inputTokens: 0, outputTokens: 0, costMillicents: 500_000, // $5.00
  });

  console.log("Not yet at a threshold");
  // A budget far above any real spend can't have crossed anything.
  await setSettings({ monthlyBudgetUsd: 100000, alertThresholds: [80, 100],
    alertsEnabled: true, alertEmail: "", lastAlertAt: null, lastAlertThreshold: null });
  let r = await checkBudgetAndAlert();
  check("nothing fires below the lowest threshold", r.firedThreshold === null, r.reason);
  check("it still reports the numbers", Number.isFinite(r.spentUsd) && Number.isFinite(r.percent));

  console.log("\nAlerts switched off");
  await setSettings({ monthlyBudgetUsd: 1, alertsEnabled: false });
  r = await checkBudgetAndAlert();
  check("disabled means silent", r.firedThreshold === null);
  check("and says why", r.reason.includes("switched off"), r.reason);

  console.log("\nNo recipients");
  // Budget of 1 cent guarantees every threshold is crossed.
  await setSettings({ monthlyBudgetUsd: 1, alertsEnabled: true,
    alertEmail: "", lastAlertAt: null, lastAlertThreshold: null });
  r = await checkBudgetAndAlert();
  const noAdmins = r.reason.includes("no recipients");
  check("either sends to admins or explains there are none",
    r.firedThreshold !== null || noAdmins, r.reason);

  console.log("\nRepeat suppression");
  await setSettings({ monthlyBudgetUsd: 1, alertsEnabled: true,
    alertEmail: "suppressed@northstar.invalid",
    lastAlertAt: new Date(), lastAlertThreshold: 100 });
  r = await checkBudgetAndAlert();
  check("already-sent threshold does not fire again", r.firedThreshold === null, r.reason);

  console.log("\nA new month resets the ledger");
  const lastMonth = new Date(); lastMonth.setUTCMonth(lastMonth.getUTCMonth() - 1);
  await setSettings({ monthlyBudgetUsd: 1, alertsEnabled: true,
    alertEmail: "suppressed@northstar.invalid",
    lastAlertAt: lastMonth, lastAlertThreshold: 100 });
  r = await checkBudgetAndAlert();
  // The send fails (invalid domain) but the *decision* to alert is what matters.
  check("last month's alert doesn't suppress this month",
    r.firedThreshold !== null || r.reason.includes("send failed") || r.reason.includes("every send failed"),
    r.reason);

  console.log("\nA failed send is not recorded as sent");
  await setSettings({ monthlyBudgetUsd: 1, alertsEnabled: true,
    alertEmail: "rejected-synchronously@example.com",
    lastAlertAt: null, lastAlertThreshold: null });
  await checkBudgetAndAlert();
  const [after] = await db.select().from(adminSettings).where(eq(adminSettings.id, "singleton"));
  check("a bounced alert leaves the ledger clear so it retries",
    after?.lastAlertThreshold === null, `got ${after?.lastAlertThreshold}`);

  await db.delete(users).where(eq(users.id, SEED_USER));

  // Restore whatever was there before.
  await setSettings({
    monthlyBudgetUsd: original?.monthlyBudgetUsd ?? 25,
    alertThresholds: original?.alertThresholds ?? [80, 100],
    alertEmail: original?.alertEmail ?? "",
    alertsEnabled: original?.alertsEnabled ?? true,
    lastAlertAt: original?.lastAlertAt ?? null,
    lastAlertThreshold: original?.lastAlertThreshold ?? null,
  });

  console.log(failures === 0 ? "\nAll checks passed.\n" : `\n${failures} failed.\n`);
  process.exit(failures === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
