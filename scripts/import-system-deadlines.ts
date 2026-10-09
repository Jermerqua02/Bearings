/* ————————————————————————————————————————
   Deadlines for application systems that publish one date for every campus.

     npm run import:system-deadlines -- --dry
     npm run import:system-deadlines

   Most schools' deadlines are not obtainable from any free structured source.
   The Common App grid covers its own members and nothing else; the federal
   surveys have never carried deadlines; and the one open archive of Common
   Data Sets splits each date across two cells that disagree often enough to
   be unusable — 65% agreement on regular decision, and half of the early
   ones unparseable.

   But a few systems run one application for every campus and publish a
   single date, which is a different kind of fact: not extracted, not
   inferred, just read off the system's own admissions page. Those are worth
   having, and they are worth hand-checking rather than parsing.

   The bar for adding an entry here is deliberately high, because a wrong
   deadline costs a student the application outright — there is no "worth
   checking" caveat that makes a two-day error survivable, the way there is
   for a fee. An entry needs the system to state the date as applying to
   every campus, and it needs a citation.

   Cal State is the instructive case. It runs one application for all 22
   campuses (23 until Cal Maritime folded into Cal Poly San Luis Obispo), so
   it looks like it belongs here, but Cal State Apply's own help centre says
   "in some instances, the individual campus's deadline may differ from the
   application's cycle dates" — and for fall 2027 they differ a great deal.
   The system's priority period closes on 30 November 2026; Chico and
   Sacramento run to 15 December, San Marcos to 31 December, Fresno and
   Channel Islands to 15 January, East Bay to 15 February, Northridge to 15
   May and Stanislaus to 30 July. One date across the system would be a guess
   wearing a uniform.

   So Cal State is done campus by campus instead: each entry below is read
   off that campus's own admissions page, keyed by IPEDS unit id, and carries
   its own citation. A campus whose page does not yet state a fall date is
   left out rather than filled in with the system date — those schools keep
   showing nothing, and the tracker links to their admissions page instead.

   Each campus gets one date: the last day a first-year can file for the
   general case. Several campuses close particular majors earlier (nursing,
   music, film, engineering); that is in the entry's note, because a
   school-level deadline cannot carry it.
   ———————————————————————————————————————— */

import "./_env";

import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { schoolAdmissions, schoolApplications, schoolDeadlines, schools } from "@/lib/db/schema";
import { CURRENT_CYCLE } from "@/lib/schools";
import type { ApplicationPlan } from "@/lib/types";

interface SystemDeadline {
  /** Matches `school_application.platform`. */
  platform: "uc" | "cal-state" | "applytexas" | "coalition";
  plan: ApplicationPlan;
  /** ISO date. */
  dueDate: string;
  /**
   * Every plan this system offers. When a system runs a single filing period
   * rather than early and regular rounds, saying so matters: the plan
   * selector otherwise falls back to offering all six, and a student picking
   * "Early Decision (binding)" for a UC is choosing something that does not
   * exist and that carries a commitment if it did.
   */
  plansOffered: ApplicationPlan[];
  /** Where this was read from, and what it said. */
  source: string;
  note: string;
}

/*
  Hand-checked, one entry per system. Re-verify each cycle: these are read off
  a page, so nothing tells us when they change.
*/
const SYSTEMS: SystemDeadline[] = [
  {
    platform: "uc",
    // UC runs a single filing period rather than early/regular rounds, so the
    // one date is the regular deadline.
    plan: "RD",
    dueDate: "2026-11-30",
    plansOffered: ["RD"],
    source:
      "https://admission.universityofcalifornia.edu/how-to-apply/applying-as-a-first-year/dates-and-deadlines.html",
    note: "Fall 2027 filing period, 1–30 November 2026, stated systemwide for all nine undergraduate campuses.",
  },
];

interface CampusDeadline {
  /**
   * IPEDS UNITID — `school.ipeds_id`. Names drift (Humboldt became Cal Poly
   * Humboldt; Scorecard writes "California State University-Long Beach"),
   * the federal id does not.
   */
  ipedsId: number;
  /** For the log and the reader; never matched on. */
  name: string;
  plan: ApplicationPlan;
  /** ISO date. */
  dueDate: string;
  /**
   * The cycle the date was published for. An entry for any other cycle is
   * skipped rather than written, so a table nobody re-checked cannot carry
   * last year's dates into this year's tracker.
   */
  cycle: string;
  plansOffered: ApplicationPlan[];
  /** The campus's own page, not the system's. */
  source: string;
  /** When the source was last read, ISO date. */
  checked: string;
  note: string;
}

/*
  Cal State, one entry per campus, fall 2027 first-year admission. Re-verify
  each cycle, and in December: campuses announce extensions after the
  priority period closes, and an extension is a later date, which is the
  safe direction to be wrong in — but only until it is announced.

  Like UC, Cal State runs one filing period rather than early and regular
  rounds, so the date is the regular deadline and RD is the only plan.

  Left out, for want of a stated fall 2027 date on the campus's own page:
  Cal Poly Humboldt (115755) — its deadlines page still shows an old term —
  and Cal Poly Maritime Academy (111188), which now admits through Cal Poly
  San Luis Obispo but keeps its own IPEDS record. calstate.edu itself sits
  behind a bot check and could not be read, so no entry rests on it.
*/
const CAL_STATE_CYCLE = "2026-27";
const CAL_STATE: CampusDeadline[] = [
  {
    ipedsId: 110486,
    name: "CSU Bakersfield",
    plan: "RD",
    dueDate: "2026-11-30",
    cycle: CAL_STATE_CYCLE,
    plansOffered: ["RD"],
    source: "https://www.csub.edu/admissions/freshman/",
    checked: "2026-10-09",
    note: "Under \"Fall 2027 applications — now open\": open via Cal State Apply 1 October – 30 November for non-impacted programs; no separate impacted-program date is given.",
  },
  {
    ipedsId: 441937,
    name: "CSU Channel Islands",
    plan: "RD",
    dueDate: "2027-01-15",
    cycle: CAL_STATE_CYCLE,
    plansOffered: ["RD"],
    source: "https://www.csuci.edu/admissions/apply.html",
    checked: "2026-10-09",
    note: "Fall 2027 first-year: opens 1 October 2026, priority deadline 15 January 2027.",
  },
  {
    ipedsId: 110538,
    name: "Chico State",
    plan: "RD",
    dueDate: "2026-12-15",
    cycle: CAL_STATE_CYCLE,
    plansOffered: ["RD"],
    source: "https://www.csuchico.edu/apply/",
    checked: "2026-10-09",
    note: "Fall 2027: submitted 1 October – 15 December 2026.",
  },
  {
    ipedsId: 110547,
    name: "CSU Dominguez Hills",
    plan: "RD",
    dueDate: "2026-12-01",
    cycle: CAL_STATE_CYCLE,
    plansOffered: ["RD"],
    source: "https://www.csudh.edu/future-students/first-time-first-year/admissions-requirements",
    checked: "2026-10-09",
    note: "Fall 2027: completed and submitted 1 October – 1 December 2026.",
  },
  {
    ipedsId: 110574,
    name: "Cal State East Bay",
    plan: "RD",
    dueDate: "2027-02-15",
    cycle: CAL_STATE_CYCLE,
    plansOffered: ["RD"],
    source:
      "https://www.csueastbay.edu/admissions/documents-deadlines-and-important-information/application-and-doc-deadlines/freshmen-students.html",
    checked: "2026-10-09",
    note: "Fall 2027 freshmen: submitted 10/1/2026 through 2/15/2027.",
  },
  {
    ipedsId: 110556,
    name: "Fresno State",
    plan: "RD",
    dueDate: "2027-01-15",
    cycle: CAL_STATE_CYCLE,
    plansOffered: ["RD"],
    source: "https://studentaffairs.fresnostate.edu/are/documents/fall27dates.pdf",
    checked: "2026-10-09",
    note: "Fall 2027 important dates: \"Fall 2027 Priority Application Filing Period Ends\" 15 January.",
  },
  {
    ipedsId: 110565,
    name: "Cal State Fullerton",
    plan: "RD",
    dueDate: "2026-11-30",
    cycle: CAL_STATE_CYCLE,
    plansOffered: ["RD"],
    source: "https://admissions.fullerton.edu/deadlines/",
    checked: "2026-10-09",
    note: "Fall 2027 first-year: 10/1/2026 to 11/30/2026.",
  },
  {
    ipedsId: 110583,
    name: "Cal State Long Beach",
    plan: "RD",
    dueDate: "2026-11-30",
    cycle: CAL_STATE_CYCLE,
    plansOffered: ["RD"],
    source: "https://www.csulb.edu/enrollment-services/key-dates-and-deadlines",
    checked: "2026-10-09",
    note: "Fall 2027 first-year: Nov. 30, 2026.",
  },
  {
    ipedsId: 110592,
    name: "Cal State LA",
    plan: "RD",
    dueDate: "2026-11-30",
    cycle: CAL_STATE_CYCLE,
    plansOffered: ["RD"],
    source: "https://www.calstatela.edu/admissions/fall-2027-admission-deadlines-undergraduates",
    checked: "2026-10-09",
    note: "Fall 2027 first-year: opens 1 October, deadline 30 November 2026.",
  },
  {
    ipedsId: 409698,
    name: "CSU Monterey Bay",
    plan: "RD",
    dueDate: "2026-11-30",
    cycle: CAL_STATE_CYCLE,
    plansOffered: ["RD"],
    source: "https://csumb.edu/admissions-aid/how-to-apply/first-year/",
    checked: "2026-10-09",
    note: "Fall 2027 timeline lists 30 November 2026 as the \"CSU priority application deadline\" and no later campus date (spring, by contrast, lists a separate CSUMB deadline).",
  },
  {
    ipedsId: 110608,
    name: "CSU Northridge",
    plan: "RD",
    dueDate: "2027-05-15",
    cycle: CAL_STATE_CYCLE,
    plansOffered: ["RD"],
    source:
      "https://www.csun.edu/admissions-financial-aid/how-to-apply/first-time-freshman-admissions",
    checked: "2026-10-09",
    note: "Fall 2027: accepted 1 August 2026 – 15 May 2027, except Music (all options) by 15 January 2027 and Cinema & Television Arts film/TV production by 31 January 2027.",
  },
  {
    ipedsId: 110529,
    name: "Cal Poly Pomona",
    plan: "RD",
    dueDate: "2026-11-30",
    cycle: CAL_STATE_CYCLE,
    plansOffered: ["RD"],
    source: "https://www.cpp.edu/admissions/freshmen/",
    checked: "2026-10-09",
    note: "Fall 2027 freshmen: \"Priority application filing: August 1 – November 30.\"",
  },
  {
    ipedsId: 110617,
    name: "Sacramento State",
    plan: "RD",
    dueDate: "2026-12-15",
    cycle: CAL_STATE_CYCLE,
    plansOffered: ["RD"],
    source: "https://www.csus.edu/apply/admissions/application-process/freshman-process.html",
    checked: "2026-10-09",
    note: "Fall 2027: apply between 1 August and 15 December 2026.",
  },
  {
    ipedsId: 110510,
    name: "CSU San Bernardino",
    plan: "RD",
    dueDate: "2027-01-31",
    cycle: CAL_STATE_CYCLE,
    plansOffered: ["RD"],
    source: "https://www.csusb.edu/admissions/apply-csusb/first-year-students",
    checked: "2026-10-09",
    note: "Fall 2027: submission 1 October 2026 – 31 January 2027, except Pre-Nursing by 30 November 2026.",
  },
  {
    ipedsId: 122409,
    name: "San Diego State",
    plan: "RD",
    dueDate: "2026-11-30",
    cycle: CAL_STATE_CYCLE,
    plansOffered: ["RD"],
    source: "https://admissions.sdsu.edu/first-years",
    checked: "2026-10-09",
    note: "Fall 2027 first-years: submit 1 October – 30 November; \"No late applications are accepted.\" (The Imperial Valley campus, 12240901, is not covered.)",
  },
  {
    ipedsId: 122597,
    name: "San Francisco State",
    plan: "RD",
    dueDate: "2026-11-30",
    cycle: CAL_STATE_CYCLE,
    plansOffered: ["RD"],
    source: "https://future.sfsu.edu/admissions/dates-deadlines",
    checked: "2026-10-09",
    note: "Fall 2027: \"Application Priority Deadline (Impacted Majors) November 30, 2026\". No later date is published for other majors, so the earlier one stands.",
  },
  {
    ipedsId: 122755,
    name: "San José State",
    plan: "RD",
    dueDate: "2026-11-30",
    cycle: CAL_STATE_CYCLE,
    plansOffered: ["RD"],
    source: "https://www.sjsu.edu/admissions/deadlines/",
    checked: "2026-10-09",
    note: "Fall 2027 first-time first-year: Cal State Apply closes 30 November 2026.",
  },
  {
    ipedsId: 110422,
    name: "Cal Poly San Luis Obispo",
    plan: "RD",
    dueDate: "2026-11-30",
    cycle: CAL_STATE_CYCLE,
    plansOffered: ["RD"],
    source: "https://www.calpoly.edu/admissions/first-year-student/dates-and-deadlines",
    checked: "2026-10-09",
    note: "\"Open from Oct. 1 – Nov. 30 … by 11:59 p.m. (PT). Late applications are not accepted.\" The page names no year; it is the standing first-year page, read during the fall 2027 filing period.",
  },
  {
    ipedsId: 366711,
    name: "CSU San Marcos",
    plan: "RD",
    dueDate: "2026-12-31",
    cycle: CAL_STATE_CYCLE,
    plansOffered: ["RD"],
    source: "https://www.csusm.edu/admissions/important-deadlines.html",
    checked: "2026-10-09",
    note: "Fall term: 1 October – 31 December, except Biology, Electrical Engineering and Nursing, which close 1 December. The page names no year; it is the standing deadlines page, read during the fall 2027 filing period.",
  },
  {
    ipedsId: 123572,
    name: "Sonoma State",
    plan: "RD",
    dueDate: "2026-11-30",
    cycle: CAL_STATE_CYCLE,
    plansOffered: ["RD"],
    source: "https://admissions.sonoma.edu/apply/application-support/fall-timeline",
    checked: "2026-10-09",
    note: "\"November 30 – Fall 2027 Priority Application Period Closes.\" Sonoma ran an extended period into spring last cycle; none is announced for fall 2027 yet.",
  },
  {
    ipedsId: 110495,
    name: "Stanislaus State",
    plan: "RD",
    dueDate: "2027-07-30",
    cycle: CAL_STATE_CYCLE,
    plansOffered: ["RD"],
    source: "https://www.csustan.edu/apply/",
    checked: "2026-10-09",
    note: "Fall 2027 first-year: submission opens 1 October 2026, \"Application Deadline: Friday, July 30, 2027.\"",
  },
];

/**
 * Only where nothing is recorded. A curated entry was checked by hand
 * against the school's own page and is not second-guessed here.
 */
async function setPlansOffered(ids: string[], plansOffered: ApplicationPlan[]): Promise<number> {
  if (ids.length === 0) return 0;
  const fixed = await db
    .update(schoolAdmissions)
    .set({ plansOffered, updatedAt: new Date() })
    .where(
      and(
        inArray(schoolAdmissions.schoolId, ids),
        eq(schoolAdmissions.cycle, CURRENT_CYCLE),
        eq(sql`cardinality(${schoolAdmissions.plansOffered})`, 0),
      ),
    )
    .returning({ id: schoolAdmissions.schoolId });
  return fixed.length;
}

async function main() {
  const dry = process.argv.includes("--dry");
  console.log(`\nSystem-wide deadlines${dry ? "  (dry run)" : ""}\n`);

  let written = 0;

  for (const s of SYSTEMS) {
    const rows = await db
      .select({ schoolId: schoolApplications.schoolId })
      .from(schoolApplications)
      .where(eq(schoolApplications.platform, s.platform));

    console.log(`  ${s.platform}: ${rows.length} schools`);
    console.log(`    ${s.plan} ${s.dueDate} — ${s.note}`);
    console.log(`    ${s.source}`);

    if (dry || rows.length === 0) continue;

    // A hand-written deadline on one of the curated forty is checked against
    // that school's own page and stays.
    await db
      .insert(schoolDeadlines)
      .values(
        rows.map((r) => ({
          schoolId: r.schoolId,
          cycle: CURRENT_CYCLE,
          plan: s.plan,
          dueDate: s.dueDate,
        })),
      )
      .onConflictDoNothing();
    written += rows.length;

    const fixed = await setPlansOffered(
      rows.map((r) => r.schoolId),
      s.plansOffered,
    );
    console.log(`    plans offered set to [${s.plansOffered.join(", ")}] on ${fixed} schools`);
  }

  console.log(`\n  cal-state, by campus: ${CAL_STATE.length} entries`);
  for (const c of CAL_STATE) {
    if (c.cycle !== CURRENT_CYCLE) {
      console.log(`    skip ${c.name}: checked for ${c.cycle}, current cycle is ${CURRENT_CYCLE}`);
      continue;
    }

    const rows = await db
      .select({ schoolId: schools.id })
      .from(schools)
      .where(eq(schools.ipedsId, c.ipedsId));

    if (rows.length !== 1) {
      // Zero means the school was never imported; more than one means the
      // id is not the unique key it should be, and guessing which row is
      // meant is exactly the error this file exists to avoid.
      console.log(`    skip ${c.name} (${c.ipedsId}): ${rows.length} schools with that IPEDS id`);
      continue;
    }
    const [{ schoolId }] = rows;

    console.log(`    ${c.name}: ${c.plan} ${c.dueDate} — ${c.note}`);
    console.log(`      ${c.source}  (checked ${c.checked})`);

    if (dry) continue;

    // As above: a hand-written deadline already on the row stays.
    await db
      .insert(schoolDeadlines)
      .values({ schoolId, cycle: CURRENT_CYCLE, plan: c.plan, dueDate: c.dueDate })
      .onConflictDoNothing();
    written += 1;

    await setPlansOffered([schoolId], c.plansOffered);
  }

  if (dry) {
    console.log("\n  dry run — nothing written\n");
    process.exit(0);
  }

  const [{ n }] = await db
    .select({ n: db.$count(schoolDeadlines) })
    .from(schoolDeadlines)
    .limit(1);
  console.log(`\n  ${written} rows offered; deadline rows in total: ${n}\n`);
  process.exit(0);
}

main().catch((err) => {
  console.error(`\n${String(err).slice(0, 500)}\n`);
  process.exit(1);
});
