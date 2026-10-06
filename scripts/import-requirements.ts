/* ————————————————————————————————————————
   What each school asks an applicant for, from IPEDS.

     npm run import:requirements -- --limit 50   # a slice, for trying it out
     npm run import:requirements                 # all of them

   No API key. The Urban Institute republishes the IPEDS admissions survey
   as JSON, and both endpoints we need are keyed by UNITID, which is already
   stamped on every school row as `ipeds_id`.

   This replaces a function that guessed. Requirements used to be derived
   from whether a school was private — two teacher recs and a $75 fee for
   anything non-public — and shown to students as fact.

   Three things the survey's shape forces on us:

   A requirement is not a boolean. IPEDS distinguishes "considered if you
   submit it" from "not considered even if you submit it", and on the test
   field labels those *Test Optional* and *Test Blind*. Those are opposite
   advice for a student deciding whether to sit the SAT.

   Absent requirements usually mean open admissions, not a gap. A school
   that admits everyone skips the survey, so all its answers are null —
   3,655 of 6,138 rows. That is an answer, and the UI has to say a different
   thing than it says for genuinely missing data.

   The answers are self-reported, and campuses of one system disagree:
   Berkeley reports that it will read a recommendation letter, UCLA reports
   that it will not. Nothing here may be phrased as a fact about a system.
   ———————————————————————————————————————— */

import "./_env";

import { inArray, isNotNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { schoolApplications, schools } from "@/lib/db/schema";
import { CURRENT_CYCLE } from "@/lib/schools";

const API = "https://educationdata.urban.org/api/v1/college-university/ipeds";

/**
 * The most recent year the admissions survey is published for.
 *
 * 2023 and 2024 return zero rows. This is stamped onto every row it writes
 * as `requirementsYear`, because it is not the application cycle and a
 * student reading "required" deserves to know how old the answer is.
 */
const SURVEY_YEAR = "2022";

/* ————————————— The survey's codes ————————————— */

/**
 * Urban renumbers IPEDS's ADMCON codes (1→1, 2→2, 3→0, 5→3). Verified
 * across 23,892 field-observations with no exceptions.
 *
 * Anything not listed — -1 not reported, -2 not applicable, -3 suppressed —
 * maps to null, which means we say nothing rather than guess.
 */
const REQUIREMENT: Record<number, "required" | "recommended" | "considered" | "not-considered"> = {
  1: "required",
  2: "recommended", // dropped by IPEDS after 2021; here for older data
  3: "considered", // "not required, but considered if submitted" — Test Optional
  0: "not-considered", // "not considered even if submitted" — Test Blind
};

function requirement(v: number | null | undefined) {
  return v == null ? null : (REQUIREMENT[v] ?? null);
}

/** Urban uses -1/-2/-3 as missing markers across every numeric field. */
function num(v: number | null | undefined): number | null {
  return v == null || v < 0 ? null : v;
}

function url(v: string | null | undefined): string | null {
  const s = v?.trim();
  if (!s || s === "-1" || s === "-2") return null;
  return s.startsWith("http") ? s : `https://${s}`;
}

/* ————————————— The platform ————————————— */

/**
 * Which system a school files through, read off the application URL.
 *
 * A hostname shared by many schools *is* a platform — the UC campuses all
 * point at one address, as do the Cal States. This needs no crawl and no
 * third-party list, and it is the routing signal the tracker needs to send
 * a student to the right place.
 */
type Platform = (typeof schoolApplications.$inferInsert)["platform"];

function platformFor(applicationUrl: string | null): Platform {
  if (!applicationUrl) return null;
  let host: string;
  try {
    host = new URL(applicationUrl).hostname.toLowerCase();
  } catch {
    return null;
  }
  if (host.includes("universityofcalifornia")) return "uc";
  if (host.includes("calstate")) return "cal-state";
  if (host.includes("applytexas")) return "applytexas";
  if (host.includes("commonapp")) return "common-app";
  if (host.includes("coalition")) return "coalition";
  return "direct";
}

/* ————————————— Fetching ————————————— */

interface Row {
  unitid: number;
  [k: string]: unknown;
}

/**
 * Both endpoints return the whole survey in one response — 6,256 rows, no
 * pagination. `next` is still honoured in case that changes.
 *
 * Sequential, not parallel: two large concurrent requests get a 403 from
 * the front door even though either alone is fine.
 */
async function fetchAll(endpoint: string, year: string): Promise<Map<number, Row>> {
  const out = new Map<number, Row>();
  let url: string | null = `${API}/${endpoint}/${year}/`;

  while (url) {
    let res: Response | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      res = await fetch(url, { headers: { "user-agent": "Bearings school data import" } });
      if (res.ok) break;
      if (attempt < 2) await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
    }
    if (!res || !res.ok) {
      const body = res ? (await res.text()).slice(0, 200) : "no response";
      throw new Error(`${endpoint} returned ${res?.status}: ${body}`);
    }

    const json = (await res.json()) as { results?: Row[]; next?: string | null };
    for (const r of json.results ?? []) out.set(r.unitid, r);
    process.stdout.write(`\r  ${endpoint}: ${out.size} rows…`);
    url = json.next ?? null;
  }

  process.stdout.write("\n");
  return out;
}

/* ————————————— Main ————————————— */

async function main() {
  const limitArg = process.argv.indexOf("--limit");
  const limit = limitArg > -1 ? Number(process.argv[limitArg + 1]) : 0;

  console.log(`\nRequirements — IPEDS ${SURVEY_YEAR}\n`);

  const ours = await db
    .select({ id: schools.id, ipedsId: schools.ipedsId, name: schools.name })
    .from(schools)
    .where(isNotNull(schools.ipedsId));

  const target = limit > 0 ? ours.slice(0, limit) : ours;
  console.log(`  ${target.length} schools with an IPEDS id\n`);

  const [reqs, dir] = [
    await fetchAll("admissions-requirements", SURVEY_YEAR),
    await fetchAll("directory", SURVEY_YEAR),
  ];

  const values = [];
  let withReqs = 0;
  let openAdmission = 0;
  let withUrl = 0;

  for (const s of target) {
    const r = reqs.get(s.ipedsId!);
    const d = dir.get(s.ipedsId!);
    if (!r && !d) continue;

    const applicationUrl = url(d?.url_application as string | undefined);
    const open = r?.open_admissions_policy;
    const isOpen = open === 1 ? true : open === 0 ? false : null;

    const requires = {
      reqEssay: requirement(r?.reqt_personal_statement as number),
      reqRecommendations: requirement(r?.reqt_recommendations as number),
      reqTranscript: requirement(r?.reqt_hs_record as number),
      reqTestScores: requirement(r?.reqt_test_scores as number),
      reqGpa: requirement(r?.reqt_hs_gpa as number),
      reqClassRank: requirement(r?.reqt_hs_rank as number),
    };
    const anyRequirement = Object.values(requires).some((v) => v !== null);

    // A row that carries nothing is worse than no row: downstream it reads
    // as "we looked and the answer is nothing" rather than "we don't know".
    if (!anyRequirement && !applicationUrl && isOpen === null) continue;

    if (anyRequirement) withReqs++;
    if (isOpen) openAdmission++;
    if (applicationUrl) withUrl++;

    values.push({
      schoolId: s.id,
      cycle: CURRENT_CYCLE,
      platform: platformFor(applicationUrl),
      applicationUrl,
      netPriceCalculatorUrl: url(d?.url_netprice as string | undefined),
      urlSource: applicationUrl ? ("ipeds" as const) : null,
      openAdmissions: isOpen,
      reqEssay: requires.reqEssay,
      reqRecommendations: requires.reqRecommendations,
      reqTranscript: requires.reqTranscript,
      reqTestScores: requires.reqTestScores,
      reqGpa: requires.reqGpa,
      reqClassRank: requires.reqClassRank,
      requirementsSource: anyRequirement ? ("ipeds" as const) : null,
      requirementsYear: anyRequirement ? SURVEY_YEAR : null,
    });
  }

  console.log(`\n  writing ${values.length} rows…`);

  for (let i = 0; i < values.length; i += 500) {
    const batch = values.slice(i, i + 500);
    await db
      .insert(schoolApplications)
      .values(batch)
      .onConflictDoUpdate({
        target: [schoolApplications.schoolId, schoolApplications.cycle],
        // Only the columns this source owns. Fee, deadlines and the
        // supplement counts come from elsewhere and must survive a re-run.
        set: {
          platform: sql`excluded.platform`,
          applicationUrl: sql`excluded.application_url`,
          netPriceCalculatorUrl: sql`excluded.net_price_calculator_url`,
          urlSource: sql`excluded.url_source`,
          openAdmissions: sql`excluded.open_admissions`,
          reqEssay: sql`excluded.req_essay`,
          reqRecommendations: sql`excluded.req_recommendations`,
          reqTranscript: sql`excluded.req_transcript`,
          reqTestScores: sql`excluded.req_test_scores`,
          reqGpa: sql`excluded.req_gpa`,
          reqClassRank: sql`excluded.req_class_rank`,
          requirementsSource: sql`excluded.requirements_source`,
          requirementsYear: sql`excluded.requirements_year`,
          updatedAt: new Date(),
        },
      });
    process.stdout.write(`\r  wrote ${Math.min(i + 500, values.length)} of ${values.length}…`);
  }

  console.log(`\n\n  ${withReqs} with requirement answers`);
  console.log(`  ${openAdmission} open admission — nothing to require`);
  console.log(`  ${withUrl} with an application URL`);

  const platforms = await db
    .select({ platform: schoolApplications.platform, n: sql<number>`count(*)::int` })
    .from(schoolApplications)
    .groupBy(schoolApplications.platform);
  console.log("\n  platform:");
  for (const p of platforms.sort((a, b) => b.n - a.n)) {
    console.log(`    ${String(p.platform ?? "unknown").padEnd(12)} ${p.n}`);
  }
  console.log();
  process.exit(0);
}

main().catch((err) => {
  console.error(`\n${String(err).slice(0, 500)}\n`);
  process.exit(1);
});
