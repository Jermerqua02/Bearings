/* ————————————————————————————————————————
   Unit economics.

   What one user actually costs us to serve. Three components:

     AI        — metered exactly, per call, in lib/counselor/usage.ts.
     Storage   — measured from real row sizes in Postgres.
     Overhead  — the flat monthly infrastructure bill, divided across
                 active users, because a $20/month box costs $20 whether
                 one person or a hundred use it.

   AI is the only one measured at the moment it happens. Storage and
   overhead are computed on read, which is why they live here rather than
   in a table: they change when the price list changes, not when the user
   does something, and a stored copy would just go stale.

   Every rate below is a list price that a vendor can change without
   telling us. Check them against the invoice before quoting these numbers
   to anyone who matters.
   ———————————————————————————————————————— */

import "server-only";

/**
 * Railway Postgres volume storage, US dollars per GB per month.
 * https://railway.com/pricing — verify before relying on it.
 */
export const STORAGE_USD_PER_GB_MONTH = 0.15;

/**
 * Flat monthly infrastructure spend that does not vary with user count:
 * the web service, the database instance, and anything else billed per
 * month rather than per request. Update when the Railway bill changes.
 */
export const MONTHLY_INFRA_USD = 20;

/**
 * A user counts as active for overhead allocation if they've signed in
 * within this window. Dividing fixed cost across *all* accounts ever
 * created would flatter the number every time someone churned.
 */
export const ACTIVE_WINDOW_DAYS = 30;

/* ————————————— Money ————————————— */

/**
 * AI cost is stored in millicents (tenths of a cent) because a
 * why-this-school call costs well under a penny and integer cents would
 * round most calls to zero. Everything here converts through that unit so
 * the two cost sources stay commensurable.
 */
export const MILLICENTS_PER_USD = 100_000;

export function usdFromMillicents(millicents: number | string | null | undefined): number {
  return Number(millicents ?? 0) / MILLICENTS_PER_USD;
}

export function millicentsFromUsd(usd: number): number {
  return Math.round(usd * MILLICENTS_PER_USD);
}

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

/* ————————————— Formatting ————————————— */

/**
 * Money at a readable precision. Sub-cent amounts are the common case for
 * a single user, and "$0.00" for forty of them tells you nothing — so
 * small values keep enough decimals to stay distinguishable.
 */
export function formatUsd(usd: number): string {
  if (usd === 0) return "$0";
  if (Math.abs(usd) < 0.01) return `${(usd * 100).toFixed(2)}¢`;
  if (Math.abs(usd) < 1) return `$${usd.toFixed(3)}`;
  return `$${usd.toFixed(2)}`;
}

export function formatMillicents(millicents: number | string | null | undefined): string {
  return formatUsd(usdFromMillicents(millicents));
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

export function formatTokens(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}k`;
  return `${(n / 1_000_000).toFixed(2)}M`;
}
