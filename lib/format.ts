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

/* ————————————— School figures ————————————— */

/*
  Every school number is optional now, because College Scorecard's coverage
  is real rather than complete. These four formatters exist so that "not
  reported" is written the same way everywhere, and so no caller has to
  decide what `undefined` looks like — the old code would have rendered it
  as "$0k net / yr" and "0% admit", which reads as a fact and is a lie.
*/

/** The em dash we use for a figure a school didn't report. */
export const NOT_REPORTED = "—";

/** "~$16k" — the net-price shorthand used on cards and stats. */
export function formatThousands(dollars: number | null | undefined): string {
  if (dollars == null) return NOT_REPORTED;
  return `$${Math.round(dollars / 1000)}k`;
}

/** "$43,120" — full precision, for the places that show real money. */
export function formatDollars(dollars: number | null | undefined): string {
  if (dollars == null) return NOT_REPORTED;
  return `$${Math.round(dollars).toLocaleString()}`;
}

/** A 0–1 rate as "43%". */
export function formatRate(rate: number | null | undefined): string {
  if (rate == null) return NOT_REPORTED;
  return `${Math.round(rate * 100)}%`;
}

/** True when a school reported enough for the cost section to say anything. */
export function hasCostData(cost: {
  avgNetPrice?: number;
  stickerPrice?: number;
}): boolean {
  return cost.avgNetPrice != null || cost.stickerPrice != null;
}
