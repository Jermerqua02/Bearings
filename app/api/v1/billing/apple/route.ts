/* ————————————————————————————————————————
   GET  /api/v1/billing/apple — the product ids to show, and this account's
        appAccountToken, which every purchase must carry
   POST /api/v1/billing/apple { signedTransaction } — the app reports a
        purchase or a restore; answers with the account's plan

   Verified against Apple before anything changes (lib/billing/apple.ts).
   ———————————————————————————————————————— */

import { requireViewer } from "@/lib/auth/policy";
import { body, route, str } from "@/lib/api/v1";
import { PRODUCTS, appAccountTokenFor, applyTransaction, verifyTransaction } from "@/lib/billing/apple";
import { planFor } from "@/lib/entitlements";

export const runtime = "nodejs";

export const GET = route("billing:apple", "We couldn't load Pro just now.", async () => {
  const viewer = await requireViewer();
  return {
    products: { monthly: PRODUCTS.monthly, season: PRODUCTS.season },
    appAccountToken: await appAccountTokenFor(viewer.userId),
  };
});

export const POST = route("billing:apple", "We couldn't confirm that purchase. If you were charged, try Restore Purchases.", async (request) => {
  const viewer = await requireViewer();
  const signed = str((await body(request)).signedTransaction, "signedTransaction", 20_000);
  const tx = await verifyTransaction(signed);
  await applyTransaction(tx, { reportedBy: viewer.userId });
  return { plan: await planFor(viewer.userId, viewer.role) };
});
