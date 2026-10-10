/* ————————————————————————————————————————
   POST /api/apple/notifications — App Store Server Notifications v2.

   Apple tells us here about everything after a purchase: renewals, a
   cancelled auto-renew, billing trouble, expiry, refunds. The body is
   signed; nothing changes until lib/billing/apple.ts has verified it.

   Answers 200 for anything verified (even types we don't act on) so Apple
   doesn't retry; 400 for anything that isn't Apple's, which Apple never
   sends.
   ———————————————————————————————————————— */

import { NextResponse } from "next/server";
import { NOTIFICATION_EVENT, applyTransaction, verifyNotification, verifyTransaction } from "@/lib/billing/apple";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let signedPayload: unknown;
  try {
    signedPayload = ((await request.json()) as { signedPayload?: unknown }).signedPayload;
  } catch {
    return NextResponse.json({ error: "Expected JSON" }, { status: 400 });
  }
  if (typeof signedPayload !== "string") return NextResponse.json({ error: "Expected signedPayload" }, { status: 400 });

  let notification;
  try {
    notification = await verifyNotification(signedPayload);
  } catch (err) {
    console.error("[apple:notifications] rejected a payload:", err);
    return NextResponse.json({ error: "Not verified" }, { status: 400 });
  }

  const type = String(notification.notificationType ?? "");
  const signedTx = notification.data?.signedTransactionInfo;
  console.log(`[apple:notifications] ${type}${notification.subtype ? `/${notification.subtype}` : ""}`);

  if (type === "TEST" || !signedTx) return NextResponse.json({ ok: true });

  try {
    const tx = await verifyTransaction(signedTx);
    await applyTransaction(tx, { event: NOTIFICATION_EVENT[type] ?? `apple.${type.toLowerCase()}` });
  } catch (err) {
    // Verified as Apple's, but not something we could apply — a product
    // that isn't Pro, say. Retrying won't change that.
    console.error(`[apple:notifications] could not apply ${type}:`, err);
  }
  return NextResponse.json({ ok: true });
}
