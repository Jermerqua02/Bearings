/* ————————————————————————————————————————
   Money, byte and token formatting.

   Separate from lib/costs.ts because that module is server-only — it holds
   vendor rates and reaches the database — while these are pure functions
   the admin's client components need too. Importing a formatter should not
   drag the cost model into the browser bundle, and `server-only` is what
   caught it trying to.
   ———————————————————————————————————————— */

/** Tenths of a cent. Sub-cent AI calls would round to zero in whole cents. */
export const MILLICENTS_PER_USD = 100_000;

export function usdFromMillicents(millicents: number | string | null | undefined): number {
  return Number(millicents ?? 0) / MILLICENTS_PER_USD;
}

export function millicentsFromUsd(usd: number): number {
  return Math.round(usd * MILLICENTS_PER_USD);
}

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
