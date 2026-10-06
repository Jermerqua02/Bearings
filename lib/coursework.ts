/* ————————————————————————————————————————
   Coursework: the arithmetic, in one place.

   GPA and rigor are computed twice in this product — once on the planner
   page to show the student their own numbers, and once on the server to
   tell the counselor what it is looking at and to keep the chance
   estimates honest. Two implementations of the same scale is how a student
   ends up reading 3.71 on one screen and hearing 3.68 on another, so both
   callers share this file.

   Deliberately free of `server-only` and of any database import: the
   planner is a client component and imports it directly.
   ———————————————————————————————————————— */

import type { CoursePlanEntry, ExtractedCourse, GradeLevel } from "./types";

/**
 * Standard unweighted 4.0 scale.
 *
 * D+ and E were missing from the first version, and the effect was not a
 * rounding error: a grade absent from this table is skipped by gpaFrom
 * entirely, so every D+ and every failing grade was quietly dropped from
 * the average instead of dragging it down. On a real transcript that alone
 * moved the computed GPA up by several tenths.
 *
 * "E" is the failing grade on Washington State transcripts, among others,
 * where the printed table reads "E or F  0.0".
 */
export const gradePoints: Record<string, number> = {
  "A+": 4.0, A: 4.0, "A-": 3.7, "B+": 3.3, B: 3.0, "B-": 2.7,
  "C+": 2.3, C: 2.0, "C-": 1.7, "D+": 1.3, D: 1.0, E: 0, F: 0,
};

/**
 * Grades that carry no grade points anywhere.
 *
 * Transcripts state this explicitly ("NOT USED IN G.P.A.: P/N, CR/NC, S/U,
 * W, I"). They are not failures and must not be averaged as zeros.
 */
const NOT_GRADED = new Set(["P", "N", "CR", "NC", "S", "U", "W", "I", "V", "--", ""]);

/** Is this a mark the school excludes from GPA rather than a letter grade? */
export function isUngraded(grade: string | undefined): boolean {
  return !grade || NOT_GRADED.has(grade.trim().toUpperCase());
}

export interface Gpa {
  unweighted: number | null;
  weighted: number | null;
  /** How many courses the average is built from. */
  graded: number;
}

/**
 * Averages over graded courses only, weighted by credit where credits are
 * known.
 *
 * Two corrections over the naive version, both learned from a real
 * transcript that computed 3.58 here against 3.01 printed on the document:
 *
 * 1. Credit weighting. A half-credit PE class and a full-credit English
 *    class are not equal terms in the average — schools divide total grade
 *    points by total credits, which is why the document shows its own
 *    arithmetic as "76.475 / 25.375 = 3.014". Courses without a credit
 *    figure fall back to 1.0 so a hand-entered plan still averages sanely.
 *
 * 2. Non-letter marks (P, CR, S, W, I) are excluded rather than treated as
 *    missing-and-therefore-skipped-by-accident.
 *
 * Courses in progress are excluded rather than counted as zero — a junior
 * halfway through the year would otherwise watch their GPA collapse.
 */
export function gpaFrom(courses: CoursePlanEntry[]): Gpa {
  const graded = courses.filter(
    (c) => !isUngraded(c.grade) && gradePoints[c.grade!.trim().toUpperCase()] !== undefined,
  );
  if (!graded.length) return { unweighted: null, weighted: null, graded: 0 };

  let uw = 0;
  let w = 0;
  let credits = 0;
  for (const c of graded) {
    const pts = gradePoints[c.grade!.trim().toUpperCase()];
    const cr = c.credits && c.credits > 0 ? c.credits : 1;
    uw += pts * cr;
    w += (pts + (c.level === "ap" || c.level === "ib" ? 1 : c.level === "honors" ? 0.5 : 0)) * cr;
    credits += cr;
  }
  return {
    unweighted: Math.round((uw / credits) * 100) / 100,
    weighted: Math.round((w / credits) * 100) / 100,
    graded: graded.length,
  };
}

export interface RigorCounts {
  apCount: number;
  ibCount: number;
  honorsCount: number;
}

/**
 * Rigor as the course plan actually shows it.
 *
 * Counts courses that are planned as well as taken, which is the same thing
 * an admissions office reads off a senior-year schedule.
 */
export function rigorCountsFrom(courses: CoursePlanEntry[]): RigorCounts {
  return {
    apCount: courses.filter((c) => c.level === "ap").length,
    ibCount: courses.filter((c) => c.level === "ib").length,
    honorsCount: courses.filter((c) => c.level === "honors").length,
  };
}

/**
 * The course plan written out for the counselor.
 *
 * Grouped by year and kept compact — this rides on every chat turn, so it
 * is a summary rather than a dump. Grades are included because "what should
 * I take senior year" and "is this school a reach" are both unanswerable
 * without them.
 */
export function courseworkSummary(
  courses: CoursePlanEntry[],
  /** The GPA printed on their transcript, when one has been read. */
  reported?: { unweighted: number | null; weighted: number | null } | null,
): string {
  if (!courses.length) return "";

  const gpa = gpaFrom(courses);
  const rigor = rigorCountsFrom(courses);

  const lines: string[] = [];
  lines.push(
    `Coursework on record (${courses.length} course rows, from their transcript or entered by hand; a year-long course appears once per grading period):`,
  );

  /*
    Order matters. The school's own figure is the one that goes on an
    application and the one their counselor quotes, so it is stated first
    and labelled as authoritative — otherwise the model reaches for whatever
    number appears first and may quote a reconstruction back at them.
  */
  if (reported?.unweighted != null) {
    lines.push(
      `- GPA printed on their transcript: ${reported.unweighted} unweighted${reported.weighted != null ? `, ${reported.weighted} weighted` : ""}. THIS is the figure to use and to quote — it is what their school reports.`,
    );
  }
  if (gpa.unweighted !== null) {
    lines.push(
      reported?.unweighted != null
        ? `- (Averaging the rows below gives ${gpa.unweighted}; it differs because schools weight by credit and exclude pass/fail work. Do not quote this one.)`
        : `- Computed from these grades: ${gpa.unweighted} unweighted, ${gpa.weighted} weighted, over ${gpa.graded} graded course${gpa.graded === 1 ? "" : "s"}.`,
    );
  }
  lines.push(
    `- Rigor in the plan: ${rigor.apCount} AP, ${rigor.ibCount} IB, ${rigor.honorsCount} honors.`,
  );

  for (const year of [9, 10, 11, 12] as GradeLevel[]) {
    const inYear = courses.filter((c) => c.year === year);
    if (!inYear.length) continue;
    const list = inYear
      .map((c) => {
        const level = c.level === "regular" ? "" : ` (${c.level.toUpperCase()})`;
        const grade = c.grade ? ` ${c.grade}` : c.status === "planned" ? " planned" : " in progress";
        const term = c.term ? ` [${c.term}]` : "";
        return `${c.name}${level}${term}:${grade}`;
      })
      .join("; ");
    lines.push(`- Grade ${year}: ${list}`);
  }

  /*
    The instruction matters as much as the data. Without it the model treats
    a course list as trivia and never brings it up; with it, "you've taken
    three years of Spanish" shows up in a school recommendation, which is
    the entire reason the student uploaded the transcript.
  */
  lines.push(
    "",
    "Use this when it is relevant: naming actual courses and grades when you discuss rigor, fit, majors, or what to take next is far more useful than talking in generalities. If the computed GPA above differs from the GPA they reported in onboarding, you may point that out plainly once — do not lecture about it.",
  );

  return lines.join("\n");
}

/**
 * Fold a transcript's per-term rows into one row per course per year.
 *
 * Transcripts are ledgers, not course lists. They record a grade for every
 * grading period, so a year-long English class is two rows on a semester
 * transcript — and on the competency-based transcript that prompted this,
 * *nine*: one per month, 0.125 credits each. Read faithfully, that document
 * yields 166 rows for what any human would call about twenty classes, and
 * the planner grid becomes unreadable — the same class name over and over,
 * looking for all the world like an import bug.
 *
 * So the ledger is folded back into courses. Credits sum, the grade shown is
 * the one from the last period (the grade the course ended on), and the term
 * field records the span it covers. Nothing is lost: the full per-term
 * reading stays on the transcript row, and the file itself is still there to
 * download.
 */
export function collapseTermRows(courses: ExtractedCourse[]): ExtractedCourse[] {
  const groups = new Map<string, ExtractedCourse[]>();
  for (const c of courses) {
    const key = `${c.year}|${c.name.trim().toLowerCase()}|${c.level}`;
    const list = groups.get(key);
    if (list) list.push(c);
    else groups.set(key, [c]);
  }

  return [...groups.values()].map((rows) => {
    if (rows.length === 1) return rows[0];

    const credits = rows.reduce((sum, r) => sum + (r.credits ?? 0), 0);
    // The grade the course finished on. Rows arrive in document order, which
    // is chronological on every transcript layout seen so far.
    const lastGraded = [...rows].reverse().find((r) => !isUngraded(r.grade));
    const terms = rows.map((r) => r.term).filter(Boolean) as string[];
    const span =
      terms.length > 1
        ? `${terms[0]}–${terms[terms.length - 1]} · ${rows.length} terms`
        : terms[0];

    return {
      ...rows[0],
      grade: lastGraded?.grade,
      credits: credits > 0 ? Math.round(credits * 1000) / 1000 : undefined,
      term: span,
    };
  });
}
