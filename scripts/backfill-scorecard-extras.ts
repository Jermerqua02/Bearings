/* ————————————————————————————————————————
   Fill in the Scorecard figures added after schools were first imported:

     - tuition and fees, in-state and out-of-state (school_cost)
     - the on-time, four-year graduation rate (school_outcome)
     - Scorecard's own weighted under-$48k net price, replacing our plain
       average of its two lowest bands (imported schools only)

     NODE_OPTIONS=--conditions=react-server tsx scripts/backfill-scorecard-extras.ts [--dry]

   import-schools.ts now writes all of these for new rows, but it inserts
   with ON CONFLICT DO NOTHING, so schools already in the table never get
   them. This updates existing rows in place, matched on IPEDS id, and
   touches nothing else. Curated schools get the new columns too; their
   hand-written net prices are left alone.

   Needs COLLEGE_SCORECARD_KEY.
   ———————————————————————————————————————— */

import "./_env";

import { and, eq, isNotNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { schoolCosts, schoolOutcomes, schools } from "@/lib/db/schema";
import { CURRENT_CYCLE } from "@/lib/schools";

const API = "https://api.data.gov/ed/collegescorecard/v1/schools";
const PER_PAGE = 100;

const FIELDS = [
  "id",
  "school.ownership",
  "latest.cost.tuition.in_state",
  "latest.cost.tuition.out_of_state",
  "latest.cost.net_price.public.by_income_level.0-48000",
  "latest.cost.net_price.private.by_income_level.0-48000",
  "latest.completion.completion_rate_4yr_100nt",
] as const;

type Row = { [K in (typeof FIELDS)[number]]: number | null } & { id: number };

async function fetchPage(key: string, page: number) {
  const url =
    `${API}?api_key=${encodeURIComponent(key)}` +
    `&school.degrees_awarded.predominant=3&school.operating=1` +
    `&fields=${FIELDS.join(",")}&per_page=${PER_PAGE}&page=${page}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Scorecard returned ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const json = (await res.json()) as { results: Row[]; metadata: { total: number } };
  return { rows: json.results ?? [], total: json.metadata?.total ?? 0 };
}

async function main() {
  const dry = process.argv.includes("--dry");
  const key = process.env.COLLEGE_SCORECARD_KEY;
  if (!key) throw new Error("Set COLLEGE_SCORECARD_KEY.");

  const ours = await db
    .select({ id: schools.id, ipedsId: schools.ipedsId, curated: schools.curated })
    .from(schools)
    .where(isNotNull(schools.ipedsId));
  const byIpeds = new Map(ours.map((s) => [s.ipedsId!, s]));
  console.log(`${ours.length} schools with an IPEDS id`);

  let costs = 0, outcomes = 0, seen = 0;
  for (let page = 0; ; page++) {
    const { rows, total } = await fetchPage(key, page);
    for (const r of rows) {
      const school = byIpeds.get(r.id);
      if (!school) continue;
      seen++;
      const pub = r["school.ownership"] === 1;
      const under48k = pub
        ? r["latest.cost.net_price.public.by_income_level.0-48000"]
        : r["latest.cost.net_price.private.by_income_level.0-48000"];

      const costSet = {
        tuitionInState: r["latest.cost.tuition.in_state"],
        tuitionOutOfState: r["latest.cost.tuition.out_of_state"],
        ...(!school.curated && under48k != null ? { netPriceUnder48k: under48k } : {}),
        updatedAt: new Date(),
      };
      const grad4 = r["latest.completion.completion_rate_4yr_100nt"];
      if (dry) {
        costs++;
        if (grad4 != null) outcomes++;
        continue;
      }
      const c = await db
        .update(schoolCosts)
        .set(costSet)
        .where(and(eq(schoolCosts.schoolId, school.id), eq(schoolCosts.year, CURRENT_CYCLE)))
        .returning({ id: schoolCosts.id });
      costs += c.length;
      if (grad4 != null) {
        const o = await db
          .update(schoolOutcomes)
          .set({ gradRate4yr: grad4, updatedAt: new Date() })
          .where(and(eq(schoolOutcomes.schoolId, school.id), eq(schoolOutcomes.year, CURRENT_CYCLE)))
          .returning({ id: schoolOutcomes.id });
        outcomes += o.length;
      }
    }
    process.stdout.write(`\r  page ${page + 1}/${Math.ceil(total / PER_PAGE)} — ${seen} matched`);
    if ((page + 1) * PER_PAGE >= total) break;
  }
  console.log(`\n${dry ? "Would update" : "Updated"} ${costs} cost rows and ${outcomes} outcome rows.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
