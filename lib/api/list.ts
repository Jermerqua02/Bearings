import "server-only";

import type { ApplicationPlan, ChanceTier, ListEntry } from "@/lib/types";

/*
  The wire values ListEntry allows. The server actions trust their typed
  arguments; over HTTP nothing is typed, so the API narrows here before an
  arbitrary string can reach a column.
*/
export const TIERS: readonly ChanceTier[] = ["reach", "target", "likely"];
export const PLANS: readonly ApplicationPlan[] = ["ED", "ED2", "EA", "REA", "RD", "rolling"];
export const STATUSES: readonly ListEntry["status"][] = [
  "considering",
  "applying",
  "in-progress",
  "submitted",
  "materials-received",
  "decision",
];
export const OUTCOMES: readonly NonNullable<ListEntry["outcome"]>[] = [
  "accepted",
  "waitlisted",
  "denied",
  "deferred",
];
