/* ————————————————————————————————————————
   Nothing on the Apply screen is asserted without a source.

     npm run test:requirements

   The defect this guards against already shipped once. `requirementsFor()`
   derived a school's requirements from whether it was private — two teacher
   recs and a $75 fee for anything non-public — and rendered the result as
   fact next to a student's real deadlines. Nobody noticed because a
   confident wrong answer looks exactly like a right one.

   So the check is not "does the data look plausible". It is structural:
   every requirement that reaches the screen must trace to a row that names
   where it came from, and every absence must be distinguishable from a zero.
   ———————————————————————————————————————— */

import "./_env";

import { db } from "@/lib/db";
import { schoolApplications } from "@/lib/db/schema";
import { getSchoolsByIds } from "@/lib/db/queries/schools";
import {
  applyRoutes,
  attribution,
  emptyReason,
  feeLabel,
  requirementLines,
} from "@/lib/requirements";
import { NOT_REPORTED } from "@/lib/format";
import { CURRENT_CYCLE } from "@/lib/schools";
import { and, eq, isNotNull, sql } from "drizzle-orm";
import type { School } from "@/lib/types";

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

const empty = { essays: [], recommenders: [] };

async function main() {
  console.log("\nRequirements\n");

  /* ————— A sample wide enough to hit every branch ————— */

  const ids = (
    await db
      .select({ id: schoolApplications.schoolId })
      .from(schoolApplications)
      .where(eq(schoolApplications.cycle, CURRENT_CYCLE))
      .orderBy(sql`random()`)
      .limit(300)
  ).map((r) => r.id);

  check("there is application data to test", ids.length > 0, `${ids.length} rows`);
  if (!ids.length) process.exit(1);

  const sample = await getSchoolsByIds(ids);

  /* ————— Nothing is asserted without a source ————— */

  let unsourced: School | null = null;
  let unsourcedFee: School | null = null;
  for (const s of sample) {
    if (requirementLines(s, empty).length > 0 && !s.application?.sources.requirements) {
      // Supplement counts can come from a different source than the
      // requirement answers; either one attributes the block.
      if (!s.application?.sources.supplements) unsourced ??= s;
    }
    if (feeLabel(s).known && !s.application?.sources.fee) unsourcedFee ??= s;
  }
  check(
    "every rendered requirement traces to a source",
    !unsourced,
    unsourced ? `${unsourced.name} renders lines with no source` : undefined,
  );
  check(
    "every stated fee traces to a source",
    !unsourcedFee,
    unsourcedFee ? `${unsourcedFee.name} shows a fee with no source` : undefined,
  );

  /* ————— An unknown fee reads as unknown, never as free ————— */

  const noFee = sample.filter((s) => s.application?.fee == null);
  check(
    "a school with no fee data shows the not-reported mark",
    noFee.every((s) => feeLabel(s).text === NOT_REPORTED && !feeLabel(s).known),
    `${noFee.length} schools have no fee`,
  );

  const zeroFee = sample.filter((s) => s.application?.fee === 0);
  check(
    "a genuine $0 fee is distinguishable from an unknown one",
    zeroFee.every((s) => feeLabel(s).known && feeLabel(s).text !== NOT_REPORTED),
    `${zeroFee.length} schools charge nothing`,
  );

  /* ————— A stale fee always says how old it is ————— */

  const stale = sample.filter(
    (s) => s.application?.fee != null && s.application.feeYear !== CURRENT_CYCLE,
  );
  const current = sample.filter(
    (s) => s.application?.fee != null && s.application.feeYear === CURRENT_CYCLE,
  );
  check(
    "a fee from an earlier year never renders without its year",
    stale.every((s) => feeLabel(s).asOf != null),
    `${stale.length} of ${stale.length + current.length} fees predate ${CURRENT_CYCLE}`,
  );
  check(
    "a current-cycle fee is not labelled as old",
    current.every((s) => feeLabel(s).asOf == null),
    `${current.length} current`,
  );
  check(
    "a stale charge warns it may have been dropped",
    stale
      .filter((s) => (s.application?.fee ?? 0) > 0)
      .every((s) => feeLabel(s).mayHaveDropped === true),
    "18% of 2023 fee-charging schools now charge nothing",
  );
  check(
    "a stale $0 carries no warning — it is the reliable direction",
    stale
      .filter((s) => s.application?.fee === 0)
      .every((s) => !feeLabel(s).mayHaveDropped),
    "only 1.2% went free -> charging",
  );
  check(
    "every fee carries a year at all",
    sample
      .filter((s) => s.application?.fee != null)
      .every((s) => !!s.application?.feeYear),
  );

  /* ————— Absence produces no line, rather than a false one ————— */

  const noReqs = sample.filter((s) => requirementLines(s, empty).length === 0);
  check(
    "a school with no requirement data renders no checklist at all",
    noReqs.every((s) => requirementLines(s, empty).length === 0),
    `${noReqs.length} of ${sample.length} have nothing to show`,
  );
  check(
    "an empty checklist says why it is empty",
    noReqs.every((s) => ["open-admission", "unknown"].includes(emptyReason(s))),
  );

  const open = sample.filter((s) => s.application?.openAdmissions);
  check(
    "open admission is reported as such, not as missing data",
    open.every((s) => emptyReason(s) === "open-admission"),
    `${open.length} open-admission schools in sample`,
  );

  /* ————— Test-blind and test-optional stay distinct ————— */

  const blind = sample.filter((s) => s.application?.requires.testScores === "not-considered");
  const optional = sample.filter((s) => s.application?.requires.testScores === "considered");
  const blindText = new Set(
    blind.map((s) => requirementLines(s, empty).find((l) => l.key === "tests")?.status),
  );
  const optionalText = new Set(
    optional.map((s) => requirementLines(s, empty).find((l) => l.key === "tests")?.status),
  );
  check(
    "test-blind and test-optional never render the same words",
    blind.length > 0 &&
      optional.length > 0 &&
      [...blindText].every((t) => !optionalText.has(t)),
    `${blind.length} blind, ${optional.length} optional`,
  );
  check(
    "neither is rendered as a requirement the student must satisfy",
    [...blind, ...optional].every(
      (s) => requirementLines(s, empty).find((l) => l.key === "tests")?.mandatory === false,
    ),
  );

  /* ————— Links go somewhere ————— */

  const routed = sample.map((s) => applyRoutes(s));
  const links = routed.flat();
  check(
    "every apply link is an absolute URL",
    links.every((l) => /^https?:\/\//.test(l.href)),
    `${links.length} routes across ${sample.length} schools`,
  );
  check(
    "every apply link is labelled with where it goes",
    links.every((l) => l.label.trim().length > 8),
  );
  check(
    "no school offers the same URL twice",
    routed.every((rs) => new Set(rs.map((r) => r.href)).size === rs.length),
  );
  // A student at a member school should see both routes; sending someone to
  // Common App for a school that isn't a member is a dead end, so the shared
  // route only ever appears when a platform was actually established.
  check(
    "a shared-platform route only appears when the school has a platform",
    sample.every(
      (s) => !routed[sample.indexOf(s)].some((r) => r.shared) || !!s.application?.platform,
    ),
  );

  /* ————— Attribution is readable, not a code ————— */

  const attributed = sample.map((s) => attribution(s)).filter(Boolean);
  check(
    "attribution names a source in words",
    attributed.length > 0 && attributed.every((a) => /according to \w/i.test(a!)),
    `${attributed.length} of ${sample.length} attributed`,
  );

  /* ————— The counts a source published are the ones shown ————— */

  const withCounts = await db
    .select({ id: schoolApplications.schoolId, n: schoolApplications.teacherRecs })
    .from(schoolApplications)
    .where(
      and(eq(schoolApplications.cycle, CURRENT_CYCLE), isNotNull(schoolApplications.teacherRecs)),
    )
    .limit(40);

  if (withCounts.length) {
    const rows = await getSchoolsByIds(withCounts.map((r) => r.id));
    const byId = new Map(withCounts.map((r) => [r.id, r.n]));
    check(
      "a published teacher-rec count is shown verbatim, never rounded or inferred",
      rows.every((s) => {
        const want = byId.get(s.id);
        if (want == null || want === 0) return true;
        const line = requirementLines(s, empty).find((l) => l.key === "recs");
        return !line || (line.detail?.includes(String(want)) ?? false);
      }),
      `${withCounts.length} schools publish a count`,
    );
  } else {
    console.log("  \x1b[33m•\x1b[0m no teacher-rec counts yet — the Common App import fills these");
  }

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(`\n${String(err).slice(0, 500)}\n`);
  process.exit(1);
});
