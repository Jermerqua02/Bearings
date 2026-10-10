/* ————————————————————————————————————————
   App Store purchases → Pro (docs/plans/lumni-pro.md, step 3).

   Two ways a purchase reaches us, and both end in applyTransaction():
     - the app, right after buying or restoring: POST /api/v1/billing/apple
       with StoreKit's signed transaction
     - Apple, for everything after — renewals, cancellations, refunds,
       expiry: App Store Server Notifications v2 at /api/apple/notifications

   Nothing is trusted until Apple's signature checks out against Apple's
   root certificate (lib/billing/AppleRootCA-G3.cer, SHA-256
   63:34:3A:BF:…:91:79). Xcode's local StoreKit testing signs nothing, so
   its transactions are accepted only off production.

   The entitlement is keyed by the transaction's originalTransactionId: a
   subscription's renewals share it and move `ends_at` forward; a refund
   sets `revoked_at`. The Season Pass is a non-renewing subscription — Apple
   gives it no expiry, so it's twelve months from purchase here.
   ———————————————————————————————————————— */

import "server-only";

import { readFileSync } from "node:fs";
import path from "node:path";
import {
  Environment,
  type JWSTransactionDecodedPayload,
  type ResponseBodyV2DecodedPayload,
  SignedDataVerifier,
} from "@apple/app-store-server-library";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { accountEvents, appStoreAccounts, entitlements } from "@/lib/db/schema";
import { UserFacingError } from "@/lib/actions/_error";

export const BUNDLE_ID = "com.promptllc.bearings";
const APP_APPLE_ID = 6819491472;

export const PRODUCTS = {
  monthly: "com.promptllc.bearings.pro.monthly",
  season: "com.promptllc.bearings.pro.season",
} as const;
const KNOWN = new Set<string>(Object.values(PRODUCTS));

const SEASON_MONTHS = 12;

/** Local StoreKit testing in Xcode is unsigned: never accepted in production. */
const ALLOW_UNSIGNED = process.env.NODE_ENV !== "production";

let roots: Buffer[] | null = null;
function rootCertificates(): Buffer[] {
  roots ??= [readFileSync(path.join(process.cwd(), "lib/billing/AppleRootCA-G3.cer"))];
  return roots;
}

const verifiers = new Map<Environment, SignedDataVerifier>();
function verifierFor(env: Environment): SignedDataVerifier {
  let v = verifiers.get(env);
  if (!v) {
    v = new SignedDataVerifier(
      rootCertificates(),
      // Revocation checks against Apple, except for unsigned local testing.
      env === Environment.PRODUCTION || env === Environment.SANDBOX,
      env,
      BUNDLE_ID,
      env === Environment.PRODUCTION ? APP_APPLE_ID : undefined,
    );
    verifiers.set(env, v);
  }
  return v;
}

/**
 * Which environment a signed payload claims, read before verifying so the
 * right verifier checks it. The claim itself is then verified: a sandbox
 * verifier rejects a production payload and the reverse.
 */
function claimedEnvironment(jws: string, field: (body: Record<string, unknown>) => unknown): Environment {
  let claimed: unknown;
  try {
    claimed = field(JSON.parse(Buffer.from(jws.split(".")[1] ?? "", "base64url").toString("utf8")));
  } catch {
    throw new UserFacingError("That purchase couldn't be read.");
  }
  switch (claimed) {
    case Environment.PRODUCTION:
      return Environment.PRODUCTION;
    case Environment.SANDBOX:
      return Environment.SANDBOX;
    case Environment.XCODE:
    case Environment.LOCAL_TESTING:
      if (ALLOW_UNSIGNED) return claimed as Environment;
      throw new UserFacingError("Test purchases aren't accepted here.");
    default:
      throw new UserFacingError("That purchase couldn't be read.");
  }
}

export async function verifyTransaction(signedTransaction: string): Promise<JWSTransactionDecodedPayload> {
  const env = claimedEnvironment(signedTransaction, (b) => b.environment);
  return verifierFor(env).verifyAndDecodeTransaction(signedTransaction);
}

export async function verifyNotification(signedPayload: string): Promise<ResponseBodyV2DecodedPayload> {
  const env = claimedEnvironment(signedPayload, (b) => (b.data as { environment?: unknown } | undefined)?.environment);
  return verifierFor(env).verifyAndDecodeNotification(signedPayload);
}

/** This account's appAccountToken, made on first ask. */
export async function appAccountTokenFor(userId: string): Promise<string> {
  const [existing] = await db
    .select({ token: appStoreAccounts.appAccountToken })
    .from(appStoreAccounts)
    .where(eq(appStoreAccounts.userId, userId))
    .limit(1);
  if (existing) return existing.token;
  const [made] = await db
    .insert(appStoreAccounts)
    .values({ userId })
    .onConflictDoNothing()
    .returning({ token: appStoreAccounts.appAccountToken });
  if (made) return made.token;
  return appAccountTokenFor(userId); // lost a race with another request; read theirs
}

async function userForToken(token: string | undefined): Promise<string | null> {
  if (!token) return null;
  const [row] = await db
    .select({ userId: appStoreAccounts.userId })
    .from(appStoreAccounts)
    .where(eq(appStoreAccounts.appAccountToken, token))
    .limit(1);
  return row?.userId ?? null;
}

function plusMonths(at: Date, months: number): Date {
  const d = new Date(at);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d;
}

/**
 * Record what a verified transaction means for Pro. `reportedBy` is the
 * signed-in account when the app sent it; for a server notification the
 * account comes from the transaction's appAccountToken, or the entitlement
 * an earlier report already made.
 *
 * Returns the account it was applied to, or null when it can't be placed
 * (a notification for a purchase we've never seen from an account we can't
 * identify — logged, and picked up when the app next reports it).
 */
export async function applyTransaction(
  tx: JWSTransactionDecodedPayload,
  opts: { reportedBy?: string; event?: string } = {},
): Promise<string | null> {
  if (tx.bundleId !== BUNDLE_ID) throw new UserFacingError("That purchase is for a different app.");
  if (!tx.productId || !KNOWN.has(tx.productId)) throw new UserFacingError("That isn't a Lumni Pro purchase.");
  if (!tx.originalTransactionId || !tx.purchaseDate) throw new UserFacingError("That purchase couldn't be read.");

  const [existing] = await db
    .select()
    .from(entitlements)
    .where(eq(entitlements.originalTransactionId, tx.originalTransactionId))
    .limit(1);

  const byToken = await userForToken(tx.appAccountToken);
  // A purchase made under one Lumni account stays with it: the app reporting
  // from another account (same Apple ID, different login) doesn't move it.
  const userId = existing?.userId ?? byToken ?? opts.reportedBy ?? null;
  if (!userId) {
    console.warn(`[billing] transaction ${tx.originalTransactionId} has no account yet`);
    return null;
  }

  const startsAt = new Date(tx.originalPurchaseDate ?? tx.purchaseDate);
  const endsAt =
    tx.productId === PRODUCTS.season
      ? plusMonths(new Date(tx.purchaseDate), SEASON_MONTHS)
      : tx.expiresDate
        ? new Date(tx.expiresDate)
        : null;
  const revokedAt = tx.revocationDate ? new Date(tx.revocationDate) : null;
  // offerType 1 is an introductory offer — the free week.
  const inTrial = tx.productId === PRODUCTS.monthly && Number(tx.offerType) === 1;

  const values = { startsAt, endsAt, revokedAt, inTrial, productId: tx.productId, updatedAt: new Date() };
  const action = opts.event ?? (existing ? "pro.updated" : "pro.purchased");

  await db.transaction(async (t) => {
    let entitlementId = existing?.id;
    if (existing) {
      await t.update(entitlements).set(values).where(eq(entitlements.id, existing.id));
    } else {
      const [row] = await t
        .insert(entitlements)
        .values({ ...values, userId, source: "app_store", originalTransactionId: tx.originalTransactionId! })
        .returning({ id: entitlements.id });
      entitlementId = row.id;
    }
    await t.insert(accountEvents).values({
      userId,
      actorKind: "apple",
      action,
      detail: {
        entitlementId,
        productId: tx.productId,
        environment: tx.environment,
        endsAt: endsAt?.toISOString() ?? null,
        inTrial,
        revoked: !!revokedAt,
      },
    });
  });
  return userId;
}

/** What each notification type is called in the account's history. */
export const NOTIFICATION_EVENT: Record<string, string> = {
  SUBSCRIBED: "pro.purchased",
  ONE_TIME_CHARGE: "pro.purchased",
  DID_RENEW: "pro.renewed",
  OFFER_REDEEMED: "pro.renewed",
  DID_CHANGE_RENEWAL_STATUS: "pro.renewal_changed",
  DID_FAIL_TO_RENEW: "pro.billing_problem",
  GRACE_PERIOD_EXPIRED: "pro.expired",
  EXPIRED: "pro.expired",
  REFUND: "pro.refunded",
  REVOKE: "pro.revoked_by_apple",
  REFUND_REVERSED: "pro.refund_reversed",
  RENEWAL_EXTENDED: "pro.renewed",
};
