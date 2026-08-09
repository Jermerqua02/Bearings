/* ————————————————————————————————————————
   Unit economics.

   What one user actually costs to serve. Three components:

     AI        — metered exactly, per call, in lib/counselor/usage.ts.
     Storage   — measured from real row sizes in Postgres.
     Overhead  — the flat monthly infrastructure bill, divided across
                 active users, because a $20/month box costs $20 whether
                 one person or a hundred use it.

   AI is the only one measured at the moment it happens. Storage and
   overhead are computed on read, which is why they live here rather than
   in a table: they change when the price list changes, not when the user
   does something, and a stored copy would just go stale.

   Every rate below is a list price a vendor can change without telling us.
   Check them against the invoice before quoting these numbers to anyone
   who matters. When RAILWAY_API_TOKEN is set, lib/railway.ts reports the
   real infrastructure bill and MONTHLY_INFRA_USD becomes the fallback.

   Formatting lives in lib/format.ts — this module is server-only, and the
   admin's client components need the formatters without it.
   ———————————————————————————————————————— */

import "server-only";

export {
  MILLICENTS_PER_USD,
  formatBytes,
  formatMillicents,
  formatTokens,
  formatUsd,
  millicentsFromUsd,
  usdFromMillicents,
} from "@/lib/format";

import { millicentsFromUsd } from "@/lib/format";

/**
 * Railway Postgres volume storage, US dollars per GB per month.
 * https://railway.com/pricing — verify before relying on it.
 */
export const STORAGE_USD_PER_GB_MONTH = 0.15;

/**
 * Flat monthly infrastructure spend, used when the Railway API isn't
 * connected. Update when the bill changes, or set RAILWAY_API_TOKEN and
 * RAILWAY_PROJECT_ID to read the real figure instead.
 */
export const MONTHLY_INFRA_USD = 20;

/**
 * A user counts as active for overhead allocation if they've signed in
 * within this window. Dividing fixed cost across *all* accounts ever
 * created would flatter the number every time someone churned.
 */
export const ACTIVE_WINDOW_DAYS = 30;

/** Storage cost for a number of bytes held for one month. */
export function storageMillicentsPerMonth(bytes: number): number {
  const gb = bytes / 1_000_000_000;
  return millicentsFromUsd(gb * STORAGE_USD_PER_GB_MONTH);
}

/** The fixed monthly bill split across active users. */
export function overheadMillicentsPerUser(activeUsers: number): number {
  if (activeUsers <= 0) return 0;
  return millicentsFromUsd(MONTHLY_INFRA_USD / activeUsers);
}
