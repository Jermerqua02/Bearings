/* ————————————————————————————————————————
   AI cost accounting.

   One place that knows what a call costs. Rates are list prices for the
   model named below — if the model changes, change these together.
   ———————————————————————————————————————— */

import "server-only";
import { db } from "@/lib/db";
import { aiUsage } from "@/lib/db/schema";

/** Claude Opus 5 list rates, US dollars per million tokens. */
const RATES = {
  model: "claude-opus-5",
  inputPerMTok: 5,
  outputPerMTok: 25,
  // Cache reads are ~0.1x input; 5-minute cache writes are 1.25x.
  cacheReadPerMTok: 0.5,
  cacheWritePerMTok: 6.25,
} as const;

export type AiFeature =
  | "chat"
  | "greet"
  | "essay_feedback"
  | "interview"
  | "why_school"
  | "throughline"
  | "summarize"
  | "speech";

export interface UsageCounts {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
}

/** Millicents (tenths of a cent) — a why-this-school call costs well under a cent. */
export function costMillicents(u: UsageCounts): number {
  const dollars =
    ((u.input_tokens ?? 0) / 1e6) * RATES.inputPerMTok +
    ((u.output_tokens ?? 0) / 1e6) * RATES.outputPerMTok +
    ((u.cache_read_input_tokens ?? 0) / 1e6) * RATES.cacheReadPerMTok +
    ((u.cache_creation_input_tokens ?? 0) / 1e6) * RATES.cacheWritePerMTok;
  return Math.round(dollars * 100_000);
}

/**
 * Record a call. Never throws — a metering failure must not take down the
 * feature the user is actually using.
 */
export async function recordUsage(
  userId: string,
  feature: AiFeature,
  usage: UsageCounts,
  model: string = RATES.model,
  /**
   * Precomputed cost, for calls priced by someone other than Anthropic —
   * speech runs on Gemini and is billed per audio token, so the rate table
   * above doesn't describe it. Omit for Claude calls.
   */
  costOverride?: number,
): Promise<void> {
  try {
    await db.insert(aiUsage).values({
      userId,
      feature,
      model,
      inputTokens: usage.input_tokens ?? 0,
      outputTokens: usage.output_tokens ?? 0,
      cacheReadTokens: usage.cache_read_input_tokens ?? 0,
      cacheCreationTokens: usage.cache_creation_input_tokens ?? 0,
      costMillicents: costOverride ?? costMillicents(usage),
    });
  } catch (err) {
    console.error("[ai-usage] failed to record:", err);
  }
}
