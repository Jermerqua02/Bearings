/* ————————————————————————————————————————
   Railway infrastructure cost.

   Pulls actual usage from Railway's GraphQL API so the cost pages report
   the real bill rather than the flat estimate in lib/costs.ts. Needs two
   variables on the web service:

     RAILWAY_API_TOKEN    a PROJECT token, not an account token. Railway
                          dashboard → the project → Settings → Tokens. An
                          account token would let anything holding this env
                          var act across every project on the account; a
                          project token can only read this one.
     RAILWAY_PROJECT_ID   the uuid in the project URL

   Every failure degrades to `configured: false` with a reason. This is a
   third-party call on the render path of an admin page: it must never be
   able to take that page down, so nothing here throws.
   ———————————————————————————————————————— */

import "server-only";

const ENDPOINT = "https://backboard.railway.com/graphql/v2";

/** Railway's measurement names, mapped to something a person reads. */
const MEASURE_LABELS: Record<string, { label: string; unit: string }> = {
  CPU_USAGE: { label: "CPU", unit: "vCPU-min" },
  MEMORY_USAGE_GB: { label: "Memory", unit: "GB-min" },
  NETWORK_TX_GB: { label: "Network egress", unit: "GB" },
  DISK_USAGE_GB: { label: "Disk", unit: "GB-min" },
  BACKUP_USAGE_GB: { label: "Backups", unit: "GB-min" },
};

export interface RailwayResource {
  label: string;
  usage: number;
  unit: string;
  costUsd: number;
}

export type RailwayCost =
  | { configured: false; reason: string }
  | { configured: true; projectedUsd: number; resources: RailwayResource[]; since: string };

function startOfBillingMonth(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/**
 * Railway's projected cost for the current billing cycle.
 *
 * Cached for 10 minutes: the numbers move slowly and Railway rate-limits.
 */
export async function railwayCost(): Promise<RailwayCost> {
  const token = process.env.RAILWAY_API_TOKEN;
  const projectId = process.env.RAILWAY_PROJECT_ID;

  if (!token || !projectId) {
    return {
      configured: false,
      reason:
        "Set RAILWAY_API_TOKEN and RAILWAY_PROJECT_ID on the web service to show live infrastructure cost.",
    };
  }

  const since = startOfBillingMonth();

  // estimatedUsage is Railway's own end-of-cycle projection. We used to
  // fetch month-to-date `usage` and straight-line it ourselves, which meant
  // reporting a number Railway had never agreed to — and getting it wrong
  // early in a billing cycle, when a few hours of data extrapolate badly.
  const query = `
    query projected($projectId: String!) {
      estimatedUsage(
        projectId: $projectId
        measurements: [CPU_USAGE, MEMORY_USAGE_GB, NETWORK_TX_GB, DISK_USAGE_GB, BACKUP_USAGE_GB]
      ) {
        measurement
        estimatedValue
      }
    }
  `;

  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ query, variables: { projectId } }),
      next: { revalidate: 600 },
    });

    if (!res.ok) {
      return { configured: false, reason: `Railway API returned ${res.status}.` };
    }

    const json = (await res.json()) as {
      data?: { estimatedUsage?: Array<{ measurement: string; estimatedValue: number }> };
      errors?: Array<{ message: string }>;
    };

    if (json.errors?.length) {
      return { configured: false, reason: `Railway API: ${json.errors[0]!.message}` };
    }

    const rows = json.data?.estimatedUsage ?? [];
    if (rows.length === 0) {
      return { configured: false, reason: "Railway returned no usage for this project." };
    }

    // The API reports projected consumption; the dollar figure is ours,
    // priced with the rates below.
    const resources: RailwayResource[] = rows.map((r) => {
      const meta = MEASURE_LABELS[r.measurement] ?? { label: r.measurement, unit: "" };
      return {
        label: meta.label,
        usage: r.estimatedValue,
        unit: meta.unit,
        costUsd: estimateUsd(r.measurement, r.estimatedValue),
      };
    });

    const projectedUsd = resources.reduce((a, r) => a + r.costUsd, 0);

    return {
      configured: true,
      projectedUsd,
      resources,
      since: since.toISOString(),
    };
  } catch (err) {
    return {
      configured: false,
      reason: err instanceof Error ? err.message : "Could not reach the Railway API.",
    };
  }
}

/**
 * Railway's usage rates, in dollars per reported unit.
 *
 * Checked against a Railway-rendered cost breakdown by dividing each
 * resource's stated cost by its stated usage, rather than transcribed from
 * a pricing page — so these reproduce the numbers Railway itself shows.
 * They are still list rates: an account with credits or a negotiated plan
 * will be billed less, and the plan's monthly seat fee is separate from
 * everything here.
 */
const RATES: Record<string, number> = {
  CPU_USAGE: 0.000473, // per vCPU-minute
  MEMORY_USAGE_GB: 0.000231, // per GB-minute
  NETWORK_TX_GB: 0.0495, // per GB egress
  DISK_USAGE_GB: 0.00000341, // per GB-minute
  BACKUP_USAGE_GB: 0.0000035, // per GB-minute
};

function estimateUsd(measurement: string, value: number): number {
  return value * (RATES[measurement] ?? 0);
}
