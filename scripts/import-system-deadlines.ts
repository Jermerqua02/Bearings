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

   Cal State is the instructive rejection. It runs one application for all 23
   campuses, so it looks like it belongs here, but Cal State Apply's own help
   centre says "in some instances, the individual campus's deadline may
   differ from the application's cycle dates" — Cal State LA publishes 30
   November while the system cycle runs to 2028. One date across 23 campuses
   would be a guess wearing a uniform. Those schools keep showing nothing,
   and the tracker links to their admissions page instead.
   ———————————————————————————————————————— */

import "./_env";

import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { schoolAdmissions, schoolApplications, schoolDeadlines } from "@/lib/db/schema";
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

    // Only where nothing is recorded. A curated entry was checked by hand
    // against the school's own page and is not second-guessed here.
    const ids = rows.map((r) => r.schoolId);
    const fixed = await db
      .update(schoolAdmissions)
      .set({ plansOffered: s.plansOffered, updatedAt: new Date() })
      .where(
        and(
          inArray(schoolAdmissions.schoolId, ids),
          eq(schoolAdmissions.cycle, CURRENT_CYCLE),
          eq(sql`cardinality(${schoolAdmissions.plansOffered})`, 0),
        ),
      )
      .returning({ id: schoolAdmissions.schoolId });
    console.log(`    plans offered set to [${s.plansOffered.join(", ")}] on ${fixed.length} schools`);
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
