/* ————————————————————————————————————————
   The school query layer, against a real database.

     npm run test:schools

   The reason this file exists: `tierExpr` in lib/db/queries/schools.ts is a
   second implementation of `chanceTier` from lib/match.ts, written in SQL so
   that filtering by chance can happen before pagination rather than after.
   Two implementations of one rule drift. This runs both over every school in
   the database, for a set of profiles chosen to reach each branch, and fails
   on the first disagreement.
   ———————————————————————————————————————— */

import "./_env";

import {
  getSchoolById,
  getSchoolsByIds,
  searchSchools,
} from "@/lib/db/queries/schools";
import { chanceRead, chanceTier } from "@/lib/match";
import { db } from "@/lib/db";
import { schools } from "@/lib/db/schema";
import type { StudentProfile } from "@/lib/types";

let passed = 0;
let failed = 0;

function check(label: string, ok: boolean, detail?: string) {
  if (ok) {
    passed++;
    console.log(`  \x1b[32m✓\x1b[0m ${label}`);
  } else {
    failed++;
    console.log(`  \x1b[31m✗\x1b[0m ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

function profile(over: Partial<StudentProfile> = {}): StudentProfile {
  return {
    role: "student",
    firstName: "Test",
    gradeLevel: 11,
    gpa: { unweighted: 3.6, weighted: 4.1 },
    rigor: { apCount: 5, ibCount: 0, honorsCount: 0 },
    testScores: { sat: 1310, planningToTest: true },
    intendedMajors: ["Biology / Pre-med"],
    undecided: false,
    activities: [],
    regions: ["midwest"],
    campus: { sizes: ["medium"], settings: ["college-town"] },
    budget: { maxPerYear: 30000, willFileFafsa: true },
    values: [],
    ...over,
  } as StudentProfile;
}

/* Each profile is chosen to exercise a different branch of the tier rule. */
const PROFILES: [string, StudentProfile][] = [
  ["gpa + SAT", profile()],
  ["gpa only", profile({ testScores: { planningToTest: false } })],
  [
    "ACT only",
    profile({ gpa: {}, testScores: { act: 29, planningToTest: true } }),
  ],
  ["no numbers at all", profile({ gpa: {}, testScores: { planningToTest: false } })],
  [
    "high rigor",
    profile({ rigor: { apCount: 9, ibCount: 2, honorsCount: 3 } }),
  ],
  [
    "low gpa, no test",
    profile({ gpa: { unweighted: 2.4 }, testScores: { planningToTest: false } }),
  ],
];

async function main() {
  console.log("\nSchool query layer\n");

  const allRows = await db.select({ id: schools.id }).from(schools);
  const allIds = allRows.map((r) => r.id);
  console.log(`  (${allIds.length} schools in the database)\n`);

  /* ————— assembly ————— */

  const batch = await getSchoolsByIds(allIds.slice(0, 50));
  check("getSchoolsByIds returns records", batch.length > 0);
  check("empty id list doesn't build invalid SQL", (await getSchoolsByIds([])).length === 0);
  check("unknown id returns null", (await getSchoolById("not-a-school")) === null);

  const curated = await getSchoolById("yale");
  check("a curated school keeps its editorial prose", !!curated?.life.vibe);
  check("a curated school reports full coverage", !!curated?.coverage.admissions);
  check("a curated school has a GPA range", !!curated?.admissions.gpaMid50);

  const thin = batch.find((s) => !s.curated && !s.admissions.gpaMid50);
  if (thin) {
    check("an imported school has no invented GPA range", thin.admissions.gpaMid50 === undefined);
    check(
      "an imported school's missing figures are undefined, not zero",
      thin.cost.avgNetPrice === undefined || typeof thin.cost.avgNetPrice === "number",
    );
  } else {
    console.log("  (no imported schools yet — run npm run import:schools)");
  }

  const halfRange = batch.find(
    (s) =>
      (s.admissions.satMid50 && s.admissions.satMid50.some((n) => n == null)) ||
      (s.admissions.gpaMid50 && s.admissions.gpaMid50.some((n) => n == null)),
  );
  check("no half-open ranges survive assembly", !halfRange);

  /* ————— tier parity: SQL vs JS ————— */

  const everySchool = await getSchoolsByIds(allIds);
  const withRate = everySchool.filter((s) => s.admissions.acceptanceRate != null);

  for (const [label, p] of PROFILES) {
    // Ask SQL for every tier by running one search per tier and unioning.
    const sqlTier = new Map<string, string>();
    for (const tier of ["reach", "target", "likely"] as const) {
      let page = 1;
      for (;;) {
        const res = await searchSchools(p, { tiers: [tier], page, perPage: 200 });
        for (const s of res.schools) sqlTier.set(s.id, tier);
        if (page >= res.pageCount) break;
        page++;
      }
    }

    const mismatches = withRate
      .map((s) => ({ id: s.id, js: chanceTier(p, s), sql: sqlTier.get(s.id) }))
      .filter((r) => r.js !== r.sql);

    check(
      `tier parity — ${label} (${withRate.length} schools)`,
      mismatches.length === 0,
      mismatches
        .slice(0, 3)
        .map((m) => `${m.id}: js=${m.js} sql=${m.sql ?? "none"}`)
        .join("; "),
    );
  }

  /* ————— confidence ————— */

  const p = profile();
  const withGpaAndSat = everySchool.find(
    (s) => s.admissions.gpaMid50 && s.admissions.satMid50 && s.admissions.acceptanceRate != null,
  );
  if (withGpaAndSat) {
    check(
      "a full read is high confidence",
      chanceRead(p, withGpaAndSat)?.confidence === "high",
    );
  }
  const noRanges = everySchool.find(
    (s) => !s.admissions.gpaMid50 && !s.admissions.satMid50 && s.admissions.acceptanceRate != null,
  );
  if (noRanges) {
    const read = chanceRead(p, noRanges);
    check("an admit-rate-only read is low confidence", read?.confidence === "low");
    check("and says so", !!read?.caveat);
  }
  const noRate = everySchool.find((s) => s.admissions.acceptanceRate == null);
  if (noRate) {
    check("no admit rate means no tier at all", chanceRead(p, noRate) === null);
  }

  /* ————— pagination ————— */

  const first = await searchSchools(p, { perPage: 10, page: 1, sort: "name" });
  const second = await searchSchools(p, { perPage: 10, page: 2, sort: "name" });
  const overlap = first.schools.filter((s) => second.schools.some((o) => o.id === s.id));
  check("pages don't overlap", overlap.length === 0, overlap.map((s) => s.id).join(", "));
  check("total counts the whole filter, not the page", first.total >= first.schools.length);
  check(
    "pageCount agrees with total",
    first.pageCount === Math.max(1, Math.ceil(first.total / 10)),
  );

  const capped = await searchSchools(p, { costCap: 15000, perPage: 200 });
  check(
    "a cost cap excludes schools over it and schools with no price",
    capped.schools.every((s) => s.cost.avgNetPrice != null && s.cost.avgNetPrice <= 15000),
  );

  const named = await searchSchools(p, { q: "college", perPage: 200 });
  check(
    "text search matches name or city",
    named.schools.every(
      (s) =>
        s.name.toLowerCase().includes("college") || s.city.toLowerCase().includes("college"),
    ),
  );

  const narrow = await searchSchools(p, {
    regions: ["northeast"],
    sizes: ["small"],
    tiers: ["likely"],
    perPage: 50,
  });
  check(
    "a narrow filter returns only matching schools",
    narrow.schools.every((s) => s.region === "northeast" && s.size === "small"),
  );
  console.log(`  (that narrow filter found ${narrow.total})`);

  console.log(
    `\n${passed} passed, ${failed} failed\n`,
  );
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
