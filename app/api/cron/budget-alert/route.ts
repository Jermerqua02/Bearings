/* ————————————————————————————————————————
   Budget alert cron endpoint.

   GET /api/cron/budget-alert

   Called on a schedule by Railway's cron, which has no session — so this
   authenticates with a shared secret in the Authorization header rather
   than a cookie. An admin session is also accepted, so the check can be
   run by hand from the browser without knowing the secret.

   Without CRON_SECRET set, only an admin session works. That is the safe
   default: an unauthenticated endpoint that sends email on demand is a way
   to have someone else's inbox filled from ours.
   ———————————————————————————————————————— */

import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { getViewer } from "@/lib/auth/policy";
import { checkBudgetAndAlert } from "@/lib/budget-alert";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Constant-time compare, so the secret can't be recovered by timing. */
function secretMatches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization") ?? "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7) : "";

  const bySecret = Boolean(secret && bearer && secretMatches(bearer, secret));

  let authorized = bySecret;
  if (!authorized) {
    const viewer = await getViewer().catch(() => null);
    authorized = viewer?.role === "admin";
  }

  if (!authorized) {
    return NextResponse.json({ error: "Not permitted" }, { status: 401 });
  }

  try {
    const outcome = await checkBudgetAndAlert();
    return NextResponse.json(outcome);
  } catch (err) {
    console.error("[cron/budget-alert] failed:", err);
    return NextResponse.json({ error: "Check failed" }, { status: 500 });
  }
}
