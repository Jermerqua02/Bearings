/* Managing Pro from Admin › Users › Manage (lib/pro-admin.ts).
   Run: npm run test:pro-admin */
import "./_env";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { accountEvents, entitlements, parentStudentLinks, users } from "@/lib/db/schema";
import { changeGrant, endGrant, grantPro, proDetail, removePro, restorePro } from "@/lib/pro-admin";
import { planFor, proStatus, proStatuses } from "@/lib/entitlements";
import { redeemSchoolCode } from "@/lib/school-licenses";
import { requestFreeAccess } from "@/lib/free-access";
import { UserFacingError } from "@/lib/actions/_error";

let failures = 0;
const check = (l: string, ok: boolean, d?: string) => {
  console.log(ok ? `  ✓ ${l}` : `  ✗ ${l}${d ? ` — ${d}` : ""}`);
  if (!ok) failures++;
};
const refused = async (f: () => Promise<unknown>) => {
  try { await f(); return null; } catch (e) { return e instanceof UserFacingError ? e.message : `unexpected: ${e}`; }
};
const day = 86_400_000;
const ymd = (ms: number) => new Date(Date.now() + ms).toISOString().slice(0, 10);

const A = { id: "pm-admin", email: "pm-admin@lumni.invalid", role: "admin" as const };
const S = { id: "pm-student", email: "pm-student@lumni.invalid", role: "student" as const };
const P = { id: "pm-parent", email: "pm-parent@lumni.invalid", role: "parent" as const };
const ALL = [A, S, P];
const tier = async (id: string, role?: string) => (await proStatus(id, role)).tier;

async function cleanup() {
  await db.delete(users).where(inArray(users.email, ALL.map((x) => x.email)));
}

async function main() {
  await cleanup();
  await db.insert(users).values(ALL.map((x) => ({ id: x.id, name: x.id, email: x.email, role: x.role })));

  console.log("\nGiving Pro\n");
  check("an end date in the past is refused", (await refused(() => grantPro(A.id, S.id, { until: ymd(-2 * day) })))?.includes("future") ?? false);
  check("an end before the start is refused", (await refused(() => grantPro(A.id, S.id, { from: ymd(10 * day), until: ymd(5 * day) })))?.includes("after the start") ?? false);
  check("admins can't be granted (they have it by role)", (await refused(() => grantPro(A.id, A.id, {})))?.includes("by role") ?? false);

  await grantPro(A.id, S.id, { from: ymd(5 * day), until: ymd(40 * day), note: "starts next week" });
  check("a grant that starts later doesn't count yet", (await tier(S.id)) === "free");
  let d = await proDetail(S.id);
  check("…and shows as scheduled", d.grants[0]?.state === "scheduled" && d.grants[0].editable);
  const scheduled = d.grants[0].id;

  await changeGrant(A.id, scheduled, { from: ymd(0), until: ymd(60 * day) });
  check("moving its start to today makes them Pro", (await tier(S.id)) === "pro");
  d = await proDetail(S.id);
  check("…with the new end date", d.grants[0].endsAt?.slice(0, 10) === ymd(60 * day));
  check("changing the end to the past is refused", (await refused(() => changeGrant(A.id, scheduled, { until: ymd(-day) })))?.includes("End now") ?? false);
  await changeGrant(A.id, scheduled, { until: null });
  check("a blank end means no end", (await proStatus(S.id)).tier === "pro" && (await proDetail(S.id)).grants[0].endsAt === null);

  await endGrant(A.id, scheduled, { note: "testing" });
  check("End now ends it", (await tier(S.id)) === "free");
  check("…and an ended grant can't be changed", (await refused(() => changeGrant(A.id, scheduled, { until: null })))?.includes("already ended") ?? false);

  console.log("\nRemoving Pro\n");
  await grantPro(A.id, S.id, {});
  await grantPro(A.id, S.id, { from: ymd(30 * day) });
  const appStore = await db
    .insert(entitlements)
    .values({ userId: P.id, source: "app_store", endsAt: new Date(Date.now() + 30 * day), productId: "test", originalTransactionId: "pm-txn" })
    .returning({ id: entitlements.id });
  await db.insert(parentStudentLinks).values({ studentId: S.id, parentId: P.id, parentEmail: P.email, status: "active", inviteToken: "pm-token" });
  check("the App Store row can't be edited here", (await refused(() => endGrant(A.id, appStore[0].id, {})))?.includes("Apple") ?? false);

  const r = await removePro(A.id, S.id, { note: "abuse report" });
  check("removing Pro makes the student Free, despite the parent's purchase", (await tier(S.id)) === "free");
  check("…and their own App Store purchase isn't running", r.appStoreActive === false);
  d = await proDetail(S.id);
  check("…ends their running and scheduled grants", d.grants.every((g) => g.state === "revoked" || g.state === "ended"));
  check("…and records who removed it and why", d.block?.by === A.email && d.block?.reason === "abuse report");
  check("the parent keeps their Pro", (await tier(P.id, "parent")) === "pro");
  check("the roster agrees", (await proStatuses([{ userId: S.id, role: "student" }, { userId: P.id, role: "parent" }])).get(S.id)?.tier === "free");
  const plan = await planFor(S.id, "student");
  check("the app is told Pro was removed (so it hides purchasing)", plan.tier === "free" && plan.blocked === true);
  check("a removed account can't use a school code", (await refused(() => redeemSchoolCode({ userId: S.id, role: "student", email: S.email, name: S.id }, "NOPE-0000")))?.includes("isn't available") ?? false);
  check("…or ask for free access", (await refused(() => requestFreeAccess({ userId: S.id, role: "student", email: S.email, name: S.id }, { message: "We can't afford it right now." })))?.includes("isn't available") ?? false);
  check("admins can't have Pro removed", (await refused(() => removePro(A.id, A.id, {})))?.includes("by role") ?? false);

  const rp = await removePro(A.id, P.id, {});
  check("removing from an App Store buyer says the subscription is still running", rp.appStoreActive === true && (await tier(P.id, "parent")) === "free");
  await restorePro(A.id, P.id, {});
  check("restoring brings the purchase back", (await tier(P.id, "parent")) === "pro");
  check("restoring twice is refused", (await refused(() => restorePro(A.id, P.id, {})))?.includes("wasn't removed") ?? false);

  await restorePro(A.id, S.id, { note: "appeal" });
  check("restoring the student brings back the parent's shared Pro", (await proStatus(S.id)).tier === "pro");
  await removePro(A.id, S.id, {});
  await grantPro(A.id, S.id, { until: ymd(10 * day) });
  check("giving Pro again lifts a removal", (await tier(S.id)) === "pro" && (await proDetail(S.id)).block === null);

  const events = await db.select({ action: accountEvents.action }).from(accountEvents).where(eq(accountEvents.userId, S.id));
  const actions = new Set(events.map((e) => e.action));
  check("the history has every kind of change", ["pro.granted", "pro.changed", "pro.revoked", "pro.removed", "pro.restored"].every((a) => actions.has(a)));

  await cleanup();
  console.log(failures ? `\n${failures} failed\n` : "\nAll passed\n");
  process.exit(failures ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  await cleanup().catch(() => {});
  process.exit(1);
});
