/* App Store purchases → Pro. Run: npm run test:billing
   Uses unsigned "Xcode" transactions — what Xcode's local StoreKit testing
   produces, accepted off production only — plus a forged "Sandbox" one,
   which must be refused. */
import "./_env";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { entitlements, users } from "@/lib/db/schema";
import { BUNDLE_ID, PRODUCTS, appAccountTokenFor, applyTransaction, verifyTransaction } from "@/lib/billing/apple";
import { proStatus } from "@/lib/entitlements";

let failures = 0;
const check = (l: string, ok: boolean, d?: string) => {
  console.log(ok ? `  ✓ ${l}` : `  ✗ ${l}${d ? ` — ${d}` : ""}`);
  if (!ok) failures++;
};
const U = "billing-test-user", U2 = "billing-test-other";
const EMAILS = ["billing@lumni.invalid", "billing-other@lumni.invalid"];
const day = 86_400_000;

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
const jws = (payload: Record<string, unknown>, env = "Xcode") =>
  `${b64({ alg: "ES256", x5c: ["AAAA"] })}.${b64({ environment: env, bundleId: BUNDLE_ID, type: "Auto-Renewable Subscription", inAppOwnershipType: "PURCHASED", signedDate: Date.now(), ...payload })}.c2ln`;

async function cleanup() { await db.delete(users).where(inArray(users.email, EMAILS)); }
const tier = async (id: string) => (await proStatus(id, "student")).tier;

async function main() {
  console.log("\nApp Store purchases\n");
  await cleanup();
  await db.insert(users).values([
    { id: U, name: "Buyer", email: EMAILS[0], role: "student" },
    { id: U2, name: "Other", email: EMAILS[1], role: "student" },
  ]);
  const token = await appAccountTokenFor(U);
  check("an account's purchase token is stable", token === (await appAccountTokenFor(U)));

  const now = Date.now();
  const trial = await verifyTransaction(jws({
    productId: PRODUCTS.monthly, originalTransactionId: "otx-1", transactionId: "tx-1",
    purchaseDate: now, originalPurchaseDate: now, expiresDate: now + 7 * day, offerType: 1, appAccountToken: token,
  }));
  await applyTransaction(trial, { reportedBy: U });
  const s1 = await proStatus(U, "student");
  check("starting the free week makes them Pro, in trial", s1.tier === "pro" && s1.source === "app_store" && s1.inTrial === true);

  const renewal = await verifyTransaction(jws({
    productId: PRODUCTS.monthly, originalTransactionId: "otx-1", transactionId: "tx-2",
    purchaseDate: now + 7 * day, originalPurchaseDate: now, expiresDate: now + 37 * day, appAccountToken: token,
  }));
  await applyTransaction(renewal, { event: "pro.renewed" });
  const s2 = await proStatus(U, "student");
  const [row] = await db.select().from(entitlements).where(eq(entitlements.originalTransactionId, "otx-1"));
  check("a renewal notice (no account given) finds the account by token and extends it",
    s2.tier === "pro" && s2.inTrial === false && row.endsAt!.getTime() === now + 37 * day);
  check("one entitlement per subscription, however many renewals", (await db.select().from(entitlements).where(eq(entitlements.userId, U))).length === 1);

  await applyTransaction(await verifyTransaction(jws({
    productId: PRODUCTS.monthly, originalTransactionId: "otx-1", transactionId: "tx-2",
    purchaseDate: now + 7 * day, originalPurchaseDate: now, expiresDate: now + 37 * day, appAccountToken: token, revocationDate: now + 8 * day,
  })), { event: "pro.refunded" });
  check("a refund ends Pro", (await tier(U)) === "free");

  const season = await verifyTransaction(jws({
    productId: PRODUCTS.season, type: "Non-Renewing Subscription", originalTransactionId: "otx-season", transactionId: "otx-season",
    purchaseDate: now, originalPurchaseDate: now, appAccountToken: token,
  }));
  await applyTransaction(season, { reportedBy: U });
  const [sp] = await db.select().from(entitlements).where(eq(entitlements.originalTransactionId, "otx-season"));
  const months = (sp.endsAt!.getUTCFullYear() - new Date(now).getUTCFullYear()) * 12 + sp.endsAt!.getUTCMonth() - new Date(now).getUTCMonth();
  check("the Season Pass is twelve months of Pro", (await tier(U)) === "pro" && months === 12);

  const elsewhere = await verifyTransaction(jws({
    productId: PRODUCTS.monthly, originalTransactionId: "otx-season", transactionId: "x",
    purchaseDate: now, expiresDate: now + day, appAccountToken: token,
  }));
  await applyTransaction(elsewhere, { reportedBy: U2 });
  check("a purchase stays with the account that made it, whoever reports it", (await tier(U2)) === "free");

  console.log("\nWhat's refused");
  let refused = false;
  try { await applyTransaction(await verifyTransaction(jws({ productId: "com.other.app.thing", originalTransactionId: "z", purchaseDate: now })), { reportedBy: U2 }); }
  catch { refused = true; }
  check("a product that isn't Pro", refused);
  refused = false;
  try { await verifyTransaction(jws({ productId: PRODUCTS.monthly, originalTransactionId: "f", purchaseDate: now }, "Sandbox")); }
  catch { refused = true; }
  check("a forged Sandbox transaction fails Apple's signature check", refused);

  await cleanup();
  console.log(failures === 0 ? "\nAll checks passed.\n" : `\n${failures} failed.\n`);
  process.exit(failures === 0 ? 0 : 1);
}
main().catch(async (e) => { console.error(e); await cleanup().catch(() => {}); process.exit(1); });
