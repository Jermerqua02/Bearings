/* ————————————————————————————————————————
   Fees, deadlines and what each member college asks for, from Common App.

     npm run import:common-app -- --dry     # parse and match, write nothing
     npm run import:common-app              # write

   Common App publishes its whole member requirements grid as one maintained
   PDF and updates it through the cycle. It is the document school counsellors
   actually work from, and it carries the two facts no free federal source
   has: the application fee, and the deadline for each plan.

   IPEDS has neither. It has 126 fields about an institution and not one of
   them is what it costs to apply.

   Two things make this safe enough to show a student.

   The grid has no IPEDS id — only names — so every row is matched by name
   and, where the grid supplies one, by state. A wrong match is worse than no
   match: it puts one school's deadline on another school's card. Anything
   ambiguous is written to a review file and skipped, never guessed.

   Every cell is validated by shape before it is believed. A fee has to look
   like a fee, a deadline like a date, a recommendation count like a small
   number. The columns are read by x position, and position is exactly the
   thing that goes wrong quietly — a cell that lands in the wrong column is
   rejected by its own shape rather than written as fact.
   ———————————————————————————————————————— */

import "./_env";

import { writeFileSync } from "node:fs";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { schoolApplications, schoolDeadlines, schools } from "@/lib/db/schema";
import { CURRENT_CYCLE } from "@/lib/schools";
import { extractPages, toRows, type TextRun } from "./lib/pdf-text";
import type { ApplicationPlan } from "@/lib/types";

const GRID_URL = "https://content.commonapp.org/Files/ReqGrid.pdf";
const REVIEW_FILE = "common-app-unmatched.txt";

/* A cell at or left of this x is part of the school name. */
const NAME_X = 150;

/** Repeated page furniture. Never a school. */
const CHROME =
  /^(Common App|member|School|type|Deadlines|Page \d|RD\/|Courses|Grades|English|Supplements|Recommendations|and requirements|\d{2}-\d{2}-\d{4}|\s*\d{4}-\d{2}|\(USD\)|Int'l|TE|OE|MR|CR)\b/i;

/*
  Column bands, as x ranges.

  Taken from the header row and widened to the midpoint between neighbours,
  because a value is centred in its column while the header above it is not —
  dates sit roughly twenty units left of the label they belong to.
*/
const COLUMNS = {
  ed: [230, 310],
  ed2: [310, 390],
  ea: [390, 470],
  // Early Action II has no equivalent in our plan vocabulary; skipped.
  rea: [550, 620],
  rdOrRolling: [620, 730],
  feeUs: [730, 810],
  feeIntl: [810, 900],
  feeWaiver: [900, 1000],
  personalEssay: [1000, 1090],
  coursesAndGrades: [1090, 1180],
  portfolio: [1180, 1290],
  writingSupplement: [1290, 1370],
  testPolicy: [1370, 1440],
  teacherEvals: [1660, 1750],
  otherEvals: [1750, 1820],
  midyearReport: [1820, 1890],
  counselorRec: [1890, 1955],
} as const;

type Column = keyof typeof COLUMNS;

interface GridRow {
  name: string;
  cells: TextRun[];
}

/* ————————————— Reading the page ————————————— */

/**
 * One record per table row, with wrapped names reassembled.
 *
 * A long name wraps above and below the line that carries the data, and for
 * a three-line name the middle line's name cell is empty. Each fragment is
 * attached to whichever data row it sits closest to vertically.
 */
function recordsFor(runs: TextRun[]): GridRow[] {
  const rows = toRows(runs);
  const data = rows.filter((r) => r.filter((c) => c.x > NAME_X).length >= 2);
  if (!data.length) return [];

  const frags = new Map<number, TextRun[]>();
  for (const row of rows) {
    if (row.filter((c) => c.x > NAME_X).length >= 2) continue;
    const frag = row.find((c) => c.x <= NAME_X);
    if (!frag || CHROME.test(frag.text.trim())) continue;
    let best = 0;
    for (let i = 1; i < data.length; i++) {
      if (Math.abs(data[i][0].y - frag.y) < Math.abs(data[best][0].y - frag.y)) best = i;
    }
    const list = frags.get(best) ?? [];
    list.push(frag);
    frags.set(best, list);
  }

  return data.map((row, i) => {
    const own = row.filter((c) => c.x <= NAME_X && !CHROME.test(c.text.trim()));
    const parts = [...own, ...(frags.get(i) ?? [])]
      // This file's text matrix is flipped: y grows downward, so a smaller y
      // is the earlier line of a wrapped name.
      .sort((a, b) => a.y - b.y)
      .map((c) => c.text.trim())
      .filter(Boolean);
    return { name: parts.join(" ").replace(/\s+/g, " ").trim(), cells: row };
  });
}

function cell(rec: GridRow, col: Column): string | null {
  const [lo, hi] = COLUMNS[col];
  const hit = rec.cells.find((c) => c.x >= lo && c.x < hi);
  const text = hit?.text.trim();
  return text ? text : null;
}

/* ————————————— Believing a cell ————————————— */

/*
  Each reader below rejects anything that does not look like its own column.
  This is the guard against a misread position: a fee that isn't "$n" and a
  deadline that isn't a date are dropped rather than stored.
*/

function fee(raw: string | null): number | null {
  if (!raw) return null;
  const m = /^\$\s?([\d,]+)$/.exec(raw);
  if (!m) return null;
  const n = Number(m[1].replace(/,/g, ""));
  // Application fees are tens of dollars. Anything larger is a misread cell.
  return Number.isFinite(n) && n <= 500 ? n : null;
}

function deadline(raw: string | null): string | null {
  if (!raw) return null;
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(raw);
  if (!m) return null;
  const [, mm, dd, yyyy] = m;
  const month = Number(mm);
  const day = Number(dd);
  const year = Number(yyyy);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  // The grid is published a year ahead; anything outside that is a misread.
  if (year < 2026 || year > 2028) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function yesNo(raw: string | null): boolean | null {
  if (!raw) return null;
  if (raw === "Y") return true;
  if (raw === "N") return false;
  return null;
}

function count(raw: string | null): number | null {
  if (!raw) return null;
  if (!/^\d$/.test(raw)) return null;
  return Number(raw);
}

/** Common App's portfolio codes. "See Website" is a real answer, not a value. */
function portfolio(raw: string | null): string | null {
  if (!raw) return null;
  return raw === "SR" || raw === "COL" ? raw : null;
}

/** Fee-waiver policy, reported as free text. */
function waiver(raw: string | null): string | null {
  if (!raw) return null;
  return /^(Accepted|U\.S\. only|Not accepted)/i.test(raw) ? raw : null;
}

/* ————————————— Matching to our schools ————————————— */

const STATES: Record<string, string> = {
  alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR", california: "CA",
  colorado: "CO", connecticut: "CT", delaware: "DE", florida: "FL", georgia: "GA",
  hawaii: "HI", idaho: "ID", illinois: "IL", indiana: "IN", iowa: "IA",
  kansas: "KS", kentucky: "KY", louisiana: "LA", maine: "ME", maryland: "MD",
  massachusetts: "MA", michigan: "MI", minnesota: "MN", mississippi: "MS",
  missouri: "MO", montana: "MT", nebraska: "NE", nevada: "NV", "new hampshire": "NH",
  "new jersey": "NJ", "new mexico": "NM", "new york": "NY", "north carolina": "NC",
  "north dakota": "ND", ohio: "OH", oklahoma: "OK", oregon: "OR", pennsylvania: "PA",
  "rhode island": "RI", "south carolina": "SC", "south dakota": "SD",
  tennessee: "TN", texas: "TX", utah: "UT", vermont: "VT", virginia: "VA",
  washington: "WA", "west virginia": "WV", wisconsin: "WI", wyoming: "WY",
};
const ABBREV = new Set(Object.values(STATES));

/**
 * The grid disambiguates same-named schools inline, in three shapes:
 * "Anderson University (IN)", "Augustana College (Illinois)", "Bethel
 * University-TN", "Benedict College - Columbia, SC". Reading the state out
 * turns the most dangerous rows — the ambiguous ones — into exact matches.
 */
function splitState(raw: string): { name: string; state: string | null } {
  let name = raw;
  let state: string | null = null;

  const paren = /\s*\(([^)]+)\)\s*$/.exec(name);
  if (paren) {
    const inner = paren[1].trim().toLowerCase();
    state =
      STATES[inner] ??
      (ABBREV.has(paren[1].trim().toUpperCase()) ? paren[1].trim().toUpperCase() : null);
    // A non-state parenthetical is a nickname — "(Caltech)" — dropped either way.
    name = name.slice(0, paren.index);
  }

  const tail = /[-,]\s*([A-Z]{2})\s*$/.exec(name);
  if (tail && ABBREV.has(tail[1])) {
    state = state ?? tail[1];
    name = name.slice(0, tail.index);
  }

  const city = /\s+-\s+[^,]+,\s*$/.exec(name);
  if (city) name = name.slice(0, city.index);

  return { name: name.trim(), state };
}

function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/[''`]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\bst\b/g, "saint")
    .replace(/\buniv\b/g, "university")
    .replace(/\b(the|of|at|and|a|in|for)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/* ————————————— Main ————————————— */

async function main() {
  const dry = process.argv.includes("--dry");
  console.log(`\nCommon App requirements grid${dry ? "  (dry run)" : ""}\n`);

  const res = await fetch(GRID_URL);
  if (!res.ok) throw new Error(`grid returned ${res.status}`);
  const pdf = Buffer.from(await res.arrayBuffer());
  console.log(`  fetched ${(pdf.length / 1024).toFixed(0)} kB`);

  const records = extractPages(pdf)
    .flatMap(recordsFor)
    .filter((r) => r.name.length > 3 && !CHROME.test(r.name));
  console.log(`  ${records.length} school records parsed\n`);

  const ours = await db
    .select({ id: schools.id, name: schools.name, state: schools.state })
    .from(schools);

  const byNorm = new Map<string, typeof ours>();
  for (const o of ours) {
    const k = norm(o.name);
    const list = byNorm.get(k) ?? [];
    list.push(o);
    byNorm.set(k, list);
  }
  const normed = ours.map((o) => ({ ...o, n: norm(o.name) }));

  const matched: { id: string; rec: GridRow }[] = [];
  const review: string[] = [];

  for (const rec of records) {
    const { name, state } = splitState(rec.name);
    const n = norm(name);

    const narrow = (cands: typeof ours) => {
      if (cands.length <= 1 || !state) return cands;
      const inState = cands.filter((c) => c.state === state);
      return inState.length ? inState : cands;
    };

    let hit = narrow(byNorm.get(n) ?? []);
    if (hit.length !== 1) {
      // The PDF clips a long name to the cell, so the grid can hold a strict
      // prefix of the real one.
      const pre = narrow(normed.filter((o) => o.n.startsWith(n + " ")));
      hit = pre.length === 1 ? pre : hit;
    }

    if (hit.length === 1) matched.push({ id: hit[0].id, rec });
    else review.push(`${rec.name}\t${hit.length === 0 ? "no candidate" : `${hit.length} candidates`}`);
  }

  console.log(`  matched     ${matched.length}`);
  console.log(`  for review  ${review.length}`);

  writeFileSync(REVIEW_FILE, `${review.sort().join("\n")}\n`);
  console.log(`  unmatched rows written to ${REVIEW_FILE}\n`);

  /* ————— Shape the rows ————— */

  const apps = [];
  const dates: { schoolId: string; cycle: string; plan: ApplicationPlan; dueDate: string }[] = [];
  const seen = new Set<string>();
  let fees = 0;

  const PLAN_COLUMN: [Column, ApplicationPlan][] = [
    ["ed", "ED"],
    ["ed2", "ED2"],
    ["ea", "EA"],
    ["rea", "REA"],
    ["rdOrRolling", "RD"],
  ];

  for (const { id, rec } of matched) {
    // One school can appear twice if two grid rows matched it; the first
    // wins rather than the last, and the duplicate goes to review.
    if (seen.has(id)) {
      review.push(`${rec.name}\tduplicate match`);
      continue;
    }
    seen.add(id);

    const feeUs = fee(cell(rec, "feeUs"));
    if (feeUs != null) fees++;

    const teacherRecs = count(cell(rec, "teacherEvals"));
    const supplements = {
      teacherRecs,
      otherRecs: count(cell(rec, "otherEvals")),
      counselorRec: yesNo(cell(rec, "counselorRec")),
      midyearReport: yesNo(cell(rec, "midyearReport")),
      writingSupplement: yesNo(cell(rec, "writingSupplement")),
      coursesAndGrades: yesNo(cell(rec, "coursesAndGrades")),
      portfolio: portfolio(cell(rec, "portfolio")),
    };
    const anySupplement = Object.values(supplements).some((v) => v !== null);

    if (feeUs != null || anySupplement) {
      apps.push({
        schoolId: id,
        cycle: CURRENT_CYCLE,
        // Appearing in this grid *is* Common App membership, and it beats the
        // guess made from the application URL. IPEDS publishes each school's
        // own admissions page, so a member looks like "direct" — 535 of them
        // did. The school's own URL is kept: a member can accept both, which
        // is the whole point of showing two routes.
        platform: "common-app" as const,
        ...supplements,
        supplementsSource: anySupplement ? ("common-app" as const) : null,
        feeUsd: feeUs,
        feeInternationalUsd: fee(cell(rec, "feeIntl")),
        feeWaiver: waiver(cell(rec, "feeWaiver")),
        feeSource: feeUs != null ? ("common-app" as const) : null,
        feeYear: feeUs != null ? CURRENT_CYCLE : null,
      });
    }

    for (const [col, plan] of PLAN_COLUMN) {
      const due = deadline(cell(rec, col));
      if (due) dates.push({ schoolId: id, cycle: CURRENT_CYCLE, plan, dueDate: due });
    }
  }

  console.log(`  ${apps.length} rows carry a fee or a requirement`);
  console.log(`  ${fees} fees`);
  console.log(`  ${dates.length} deadlines\n`);

  if (dry) {
    console.log("  dry run — nothing written\n");
    process.exit(0);
  }

  /* ————— Write ————— */

  for (let i = 0; i < apps.length; i += 500) {
    await db
      .insert(schoolApplications)
      .values(apps.slice(i, i + 500))
      .onConflictDoUpdate({
        target: [schoolApplications.schoolId, schoolApplications.cycle],
        // Only what this source owns. The requirement answers and the
        // application URL come from IPEDS and must survive a re-run.
        set: {
          teacherRecs: sql`excluded.teacher_recs`,
          otherRecs: sql`excluded.other_recs`,
          counselorRec: sql`excluded.counselor_rec`,
          midyearReport: sql`excluded.midyear_report`,
          writingSupplement: sql`excluded.writing_supplement`,
          coursesAndGrades: sql`excluded.courses_and_grades`,
          portfolio: sql`excluded.portfolio`,
          supplementsSource: sql`excluded.supplements_source`,
          feeUsd: sql`excluded.fee_usd`,
          feeInternationalUsd: sql`excluded.fee_international_usd`,
          feeWaiver: sql`excluded.fee_waiver`,
          feeSource: sql`excluded.fee_source`,
          feeYear: sql`excluded.fee_year`,
          platform: sql`excluded.platform`,
          updatedAt: new Date(),
        },
      });
  }

  // The curated forty carry hand-checked dates that are better than a
  // parsed cell, so an existing row is never replaced.
  if (dates.length) {
    for (let i = 0; i < dates.length; i += 500) {
      await db.insert(schoolDeadlines).values(dates.slice(i, i + 500)).onConflictDoNothing();
    }
  }

  const [{ n: totalFees }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schoolApplications)
    .where(and(eq(schoolApplications.cycle, CURRENT_CYCLE), sql`fee_usd is not null`));
  const [{ n: totalDates }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schoolDeadlines)
    .where(eq(schoolDeadlines.cycle, CURRENT_CYCLE));

  console.log(`  schools with a fee:       ${totalFees}`);
  console.log(`  deadline rows in total:   ${totalDates}\n`);
  process.exit(0);
}

main().catch((err) => {
  console.error(`\n${String(err).slice(0, 500)}\n`);
  process.exit(1);
});
