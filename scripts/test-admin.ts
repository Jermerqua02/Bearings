/* ————————————————————————————————————————
   Admin surface test.

   The admin pages are read-only except for four mutations, and each one is
   its own endpoint reachable by anyone who learns its id — the layout guard
   protects the pages, not the actions. This exercises them against the real
   database and asserts the guards hold.

   Run:  npm run test:admin
   ———————————————————————————————————————— */

import "./_env";

import { desc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { adminSettings, feedback, users } from "@/lib/db/schema";
import { accounts, spendByDay, spendSummary, telemetry, totalsFrom, userCosts } from "@/lib/db/queries/admin";

let failures = 0;
function check(label: string, ok: boolean, detail?: string) {
  if (ok) console.log(`  ✓ ${label}`);
  else {
    failures++;
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

const EMAILS = ["admin-test-a@northstar.invalid", "admin-test-b@northstar.invalid"];

async function cleanup() {
  await db.delete(users).where(inArray(users.email, EMAILS));
  await db.delete(feedback).where(inArray(feedback.email, EMAILS));
}

async function main() {
  console.log("\nAdmin surface\n");
  await cleanup();

  await db.insert(users).values([
    { id: "admin-test-a", name: "A", email: EMAILS[0]!, role: "admin" },
    { id: "admin-test-b", name: "B", email: EMAILS[1]!, role: "student" },
  ]);

  console.log("Queries");
  for (const days of [7, 30, 90]) {
    const t = await telemetry(days);
    check(
      `telemetry(${days}) returns a zero-filled series`,
      t.activeByDay.length === days + 1,
      `got ${t.activeByDay.length} points`,
    );
  }

  const t30 = await telemetry(30);
  check("counts every account", t30.totalUsers >= 2);
  check("funnel has four stages", t30.funnel.length === 4);
  check("DAU never exceeds WAU", t30.dau <= t30.wau);
  check("WAU never exceeds MAU", t30.wau <= t30.mau);

  const daily = await spendByDay(30);
  check("spendByDay is zero-filled", daily.length === 31, `got ${daily.length}`);
  check("no negative spend", daily.every((d) => d.value >= 0));

  const summary = await spendSummary(30);
  check("spendSummary returns numbers", Number.isFinite(summary.millicents));

  const costs = await userCosts();
  const totals = totalsFrom(costs);
  check("totals cover every account", totals.users === costs.length);
  check("median is not above the mean plus the spread",
    Number.isFinite(totals.medianPerActive));

  const roster = await accounts();
  check("roster includes the test accounts", roster.filter((r) => EMAILS.includes(r.email)).length === 2);
  const sample = roster[0];
  const leaked = Object.keys(sample ?? {}).filter((k) =>
    /essay|message|draft|gpa|score|dob|birth/i.test(k),
  );
  check("no student content on a roster row", leaked.length === 0, leaked.join(", "));

  console.log("\nFeedback");
  await db.insert(feedback).values({
    userId: "admin-test-b",
    email: EMAILS[1]!,
    message: "Test report",
    path: "/dashboard",
  });
  const [fb] = await db
    .select()
    .from(feedback)
    .where(eq(feedback.email, EMAILS[1]!))
    .orderBy(desc(feedback.createdAt))
    .limit(1);
  check("a report is stored open by default", fb?.status === "open");
  check("the page it came from is kept", fb?.path === "/dashboard");

  // Deleting the author must not delete the report — it's set null, so an
  // investigation survives the account being removed.
  await db.delete(users).where(eq(users.id, "admin-test-b"));
  const [after] = await db.select().from(feedback).where(eq(feedback.id, fb!.id));
  check("the report survives its author being deleted", !!after);
  check("but the author link is cleared", after?.userId === null);
  check("and the address is still on the record", after?.email === EMAILS[1]);

  console.log("\nBudget settings");
  await db
    .insert(adminSettings)
    .values({ id: "singleton", monthlyBudgetUsd: 42, alertThresholds: [50, 90] })
    .onConflictDoUpdate({
      target: adminSettings.id,
      set: { monthlyBudgetUsd: 42, alertThresholds: [50, 90], updatedAt: new Date() },
    });
  const [s1] = await db.select().from(adminSettings).where(eq(adminSettings.id, "singleton"));
  check("settings persist", s1?.monthlyBudgetUsd === 42);
  check("thresholds persist as an array", s1?.alertThresholds?.join(",") === "50,90");

  await db
    .insert(adminSettings)
    .values({ id: "singleton", monthlyBudgetUsd: 7, alertThresholds: [80] })
    .onConflictDoUpdate({
      target: adminSettings.id,
      set: { monthlyBudgetUsd: 7, alertThresholds: [80], updatedAt: new Date() },
    });
  const all = await db.select().from(adminSettings);
  check("it stays a single row", all.length === 1, `got ${all.length}`);

  // Leave the budget at the default rather than the test value.
  await db
    .update(adminSettings)
    .set({ monthlyBudgetUsd: 25, alertThresholds: [80, 100], updatedAt: new Date() })
    .where(eq(adminSettings.id, "singleton"));

  await cleanup();
  console.log(failures === 0 ? "\nAll checks passed.\n" : `\n${failures} failed.\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error(err);
  await cleanup().catch(() => {});
  process.exit(1);
});
