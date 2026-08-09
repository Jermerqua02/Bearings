/* ————————————————————————————————————————
   Per-user rate limiting on the endpoints that spend money.

   The budget alert tells you after the fact that spend crossed a line.
   That is a smoke detector, not a fuse. Nothing stopped one signed-in
   account — a curious user, a retry loop, a script — from spending the
   month's budget in an afternoon, and the first anyone would know is the
   email.

   Deliberately in Postgres rather than memory. The app runs as more than
   one instance at times, and an in-memory counter would let each replica
   grant the full allowance independently — a limit that loosens exactly
   when traffic is high enough to matter.

   Fails open. If the limiter itself errors, the request proceeds: a
   database hiccup should not take down the counselor. Spending is bounded
   by the budget alert and the provider's own limits underneath this.
   ———————————————————————————————————————— */

import "server-only";

import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

export interface Limit {
  /** How many calls are allowed in the window. */
  max: number;
  /** Window length in minutes. */
  windowMinutes: number;
}

/**
 * Per-feature allowances, sized to be invisible to a person using the
 * product and obvious to a loop.
 *
 * Speech is the tightest: it is the most expensive per call and the least
 * likely to be wanted forty times in an hour.
 */
export const LIMITS: Record<string, Limit> = {
  speech: { max: 30, windowMinutes: 60 },
  chat: { max: 120, windowMinutes: 60 },
  essay_feedback: { max: 60, windowMinutes: 60 },
  interview: { max: 60, windowMinutes: 60 },
  default: { max: 200, windowMinutes: 60 },
};

export interface RateVerdict {
  allowed: boolean;
  /** Calls already made in the current window. */
  used: number;
  limit: number;
  /** Seconds until the window frees up, when blocked. */
  retryAfterSeconds: number;
}

/**
 * Check the allowance for one user and feature.
 *
 * Counts ai_usage rows rather than keeping a separate counter, so the limit
 * is measured against the same record the cost pages bill from — there is
 * no second source of truth to drift.
 */
export async function checkRateLimit(
  userId: string,
  feature: string,
): Promise<RateVerdict> {
  const limit = LIMITS[feature] ?? LIMITS.default!;

  try {
    const rows = await db.execute<{ used: string; oldest: Date | null }>(sql`
      select count(*) as used, min(created_at) as oldest
      from "ai_usage"
      where user_id = ${userId}
        and feature = ${feature}::ai_feature
        and created_at > now() - (${limit.windowMinutes} || ' minutes')::interval
    `);

    const used = Number(rows[0]?.used ?? 0);
    const oldest = rows[0]?.oldest ? new Date(rows[0].oldest) : null;

    // The window frees up when the oldest call in it ages out.
    const retryAfterSeconds = oldest
      ? Math.max(
          1,
          Math.ceil(
            (oldest.getTime() + limit.windowMinutes * 60_000 - Date.now()) / 1000,
          ),
        )
      : limit.windowMinutes * 60;

    return { allowed: used < limit.max, used, limit: limit.max, retryAfterSeconds };
  } catch (err) {
    console.error("[rate-limit] check failed, allowing the request:", err);
    return { allowed: true, used: 0, limit: limit.max, retryAfterSeconds: 0 };
  }
}
