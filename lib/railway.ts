/* ————————————————————————————————————————
   Railway infrastructure cost.

   Pulls actual usage from Railway's GraphQL API so the cost pages report
   the real bill rather than the flat estimate in lib/costs.ts. Needs two
   variables on the web service:

     RAILWAY_API_TOKEN    account or team token (railway.com/account/tokens)
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
 * Current billing month's usage, with an end-of-cycle projection.
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

  const query = `
    query usage($projectId: String!, $startDate: DateTime!) {
      usage(
        projectId: $projectId
        startDate: $startDate
        measurements: [CPU_USAGE, MEMORY_USAGE_GB, NETWORK_TX_GB, DISK_USAGE_GB, BACKUP_USAGE_GB]
      ) {
        measurement
        value
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
      body: JSON.stringify({
        query,
        variables: { projectId, startDate: since.toISOString() },
      }),
      next: { revalidate: 600 },
    });

    if (!res.ok) {
      return { configured: false, reason: `Railway API returned ${res.status}.` };
    }

    const json = (await res.json()) as {
      data?: { usage?: Array<{ measurement: string; value: number }> };
      errors?: Array<{ message: string }>;
    };

    if (json.errors?.length) {
      return { configured: false, reason: `Railway API: ${json.errors[0]!.message}` };
    }

    const rows = json.data?.usage ?? [];
    if (rows.length === 0) {
      return { configured: false, reason: "Railway returned no usage for this project." };
    }

    // Railway's usage response reports consumption; cost per unit is on the
    // plan, so estimate with published rates and label it a projection.
    const resources: RailwayResource[] = rows.map((r) => {
      const meta = MEASURE_LABELS[r.measurement] ?? { label: r.measurement, unit: "" };
      return {
        label: meta.label,
        usage: r.value,
        unit: meta.unit,
        costUsd: estimateUsd(r.measurement, r.value),
      };
    });

    const spentSoFar = resources.reduce((a, r) => a + r.costUsd, 0);

    // Straight-line to end of month.
    const now = Date.now();
    const elapsedMs = now - since.getTime();
    const endOfMonth = new Date(
      Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() + 1, 1),
    ).getTime();
    const totalMs = endOfMonth - since.getTime();
    const projectedUsd = elapsedMs > 0 ? (spentSoFar / elapsedMs) * totalMs : spentSoFar;

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

/** Railway's published usage rates. Verify against the invoice. */
function estimateUsd(measurement: string, value: number): number {
  switch (measurement) {
    case "CPU_USAGE":
      return (value / 60) * 0.000463 * 60; // ~$0.000463 per vCPU-minute
    case "MEMORY_USAGE_GB":
      return value * 0.000231; // per GB-minute
    case "NETWORK_TX_GB":
      return value * 0.05; // per GB egress
    case "DISK_USAGE_GB":
      return value * 0.00000381; // per GB-minute
    case "BACKUP_USAGE_GB":
      return value * 0.0000035;
    default:
      return 0;
  }
}
