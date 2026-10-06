/* ————————————————————————————————————————
   Transcript actions: read it, keep it, or throw it away.

   Upload and download are route handlers (see app/api/transcript) because
   they move bytes. Everything here moves decisions, which is small enough
   for an action and belongs next to the other data mutations.

   The three-step shape — upload, read, confirm — is deliberate. A model
   reading a scanned table gets things wrong, and the thing it is writing
   into is the student's academic record. So the reading is stored as a
   *proposal* on the transcript row, and nothing reaches course_plan_entry
   until the student presses the button.
   ———————————————————————————————————————— */

"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { coursePlanEntries, studentProfiles, transcripts } from "@/lib/db/schema";
import { requireStudent } from "@/lib/auth/policy";
import { safeError } from "@/lib/actions/_error";
import { checkRateLimit } from "@/lib/rate-limit";
import { createClaudeCounselor } from "@/lib/counselor/claude";
import { collapseTermRows, rigorCountsFrom, type RigorCounts } from "@/lib/coursework";
import type {
  CoursePlanEntry,
  ExtractedCourse,
  GradeLevel,
  ReportedGpa,
} from "@/lib/types";

export type ReadResult =
  | {
      ok: true;
      courses: ExtractedCourse[];
      notes: string[];
      looksLikeTranscript: boolean;
      /** What the document prints for itself — shown in place of our own math. */
      reportedGpa: ReportedGpa;
    }
  | { ok: false; error: string };

/**
 * Read an uploaded transcript with the model and store the result.
 *
 * Re-reading the same file returns the cached extraction rather than paying
 * for the call again — the page calls this on open as well as after upload,
 * and a PDF is the most expensive input the product sends anywhere.
 */
export async function readTranscriptAction(
  transcriptId: string,
  opts: { force?: boolean } = {},
): Promise<ReadResult> {
  try {
    const student = await requireStudent();

    const [row] = await db
      .select({
        bytes: transcripts.bytes,
        contentType: transcripts.contentType,
        filename: transcripts.filename,
        extraction: transcripts.extraction,
        reportedGpa: transcripts.reportedGpa,
        reportedGpaWeighted: transcripts.reportedGpaWeighted,
        reportedCredits: transcripts.reportedCredits,
      })
      .from(transcripts)
      .where(and(eq(transcripts.id, transcriptId), eq(transcripts.studentId, student.userId)))
      .limit(1);

    if (!row) return { ok: false, error: "That file is no longer here." };

    if (!opts.force && Array.isArray(row.extraction)) {
      return {
        ok: true,
        // Stored raw (one row per grading period); folded into courses for
        // display. The full reading stays in the column.
        courses: collapseTermRows(row.extraction as ExtractedCourse[]),
        notes: [],
        looksLikeTranscript: true,
        reportedGpa: {
          unweighted: row.reportedGpa,
          weighted: row.reportedGpaWeighted,
          credits: row.reportedCredits,
        },
      };
    }

    const rate = await checkRateLimit(student.userId, "transcript");
    if (!rate.allowed) {
      const minutes = Math.ceil(rate.retryAfterSeconds / 60);
      return {
        ok: false,
        error: `You've read ${rate.limit} transcripts in the last hour. Try again in about ${minutes} minute${minutes === 1 ? "" : "s"}.`,
      };
    }

    const counselor = createClaudeCounselor({
      // Transcript reading never names a school, so the pruning set this
      // dependency exists for is irrelevant here.
      knownSchoolIds: async () => new Set<string>(),
      userId: student.userId,
    });

    const reading = await counselor.readTranscript({
      bytes: Buffer.from(row.bytes),
      contentType: row.contentType,
      filename: row.filename,
    });

    await db
      .update(transcripts)
      .set({
        extraction: reading.courses,
        reportedGpa: reading.reportedGpa.unweighted,
        reportedGpaWeighted: reading.reportedGpa.weighted,
        reportedCredits: reading.reportedGpa.credits,
        extractedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(transcripts.id, transcriptId), eq(transcripts.studentId, student.userId)));

    revalidatePath("/planner");
    return { ...reading, ok: true, courses: collapseTermRows(reading.courses) };
  } catch (err) {
    return {
      ok: false,
      error: safeError(
        "transcript-read",
        err,
        "We couldn't read that file. It may be a scan the model can't make out — you can still add courses by hand.",
      ),
    };
  }
}

export type AddCoursesResult =
  | {
      ok: true;
      added: CoursePlanEntry[];
      /** Already on the plan, so left alone. */
      skipped: number;
      /** Rigor counts as they now stand, after the profile was updated. */
      rigor: RigorCounts | null;
    }
  | { ok: false; error: string };

/**
 * Put confirmed courses into the course plan.
 *
 * Takes the courses from the client rather than re-reading the stored
 * extraction, because the student may have edited or unticked rows in the
 * review panel — but validates every field against the same enums the
 * column accepts, since a client payload is never trusted.
 */
export async function addExtractedCoursesAction(
  courses: ExtractedCourse[],
): Promise<AddCoursesResult> {
  try {
    const student = await requireStudent();

    const clean = courses.filter(isValidCourse).slice(0, 120);
    if (!clean.length) return { ok: true, added: [], skipped: 0, rigor: null };

    // Adding the same transcript twice is an easy mistake and a tedious one
    // to undo by hand, so an existing course in the same year with the same
    // name is left alone rather than duplicated.
    const existing = await db
      .select({ year: coursePlanEntries.year, name: coursePlanEntries.name })
      .from(coursePlanEntries)
      .where(eq(coursePlanEntries.studentId, student.userId));
    const seen = new Set(existing.map((c) => `${c.year}|${c.name.trim().toLowerCase()}`));

    const fresh = clean.filter((c) => !seen.has(`${c.year}|${c.name.trim().toLowerCase()}`));
    if (!fresh.length) return { ok: true, added: [], skipped: clean.length, rigor: null };

    const rows = await db
      .insert(coursePlanEntries)
      .values(
        fresh.map((c) => ({
          studentId: student.userId,
          year: c.year,
          subject: c.subject,
          name: c.name.trim().slice(0, 120),
          level: c.level,
          // A grade on the transcript means the course is finished. Without
          // one it is either in progress or upcoming, and the transcript
          // can't tell us which — "in-progress" is the safer read, since a
          // transcript only lists courses that have started.
          status: (c.grade ? "completed" : "in-progress") as CoursePlanEntry["status"],
          grade: c.grade ?? null,
          term: c.term ?? null,
          credits: c.credits ?? null,
        })),
      )
      .returning({ id: coursePlanEntries.id });

    const addedEntries: CoursePlanEntry[] = fresh.map((c, i) => ({
      id: rows[i].id,
      year: c.year,
      subject: c.subject,
      name: c.name.trim().slice(0, 120),
      level: c.level,
      status: (c.grade ? "completed" : "in-progress") as CoursePlanEntry["status"],
      grade: c.grade,
      term: c.term,
      credits: c.credits,
    }));

    const rigor = await syncRigorFromCoursePlan(student.userId);

    revalidatePath("/planner");
    revalidatePath("/counselor");
    return {
      ok: true,
      rigor,
      added: addedEntries,
      skipped: clean.length - fresh.length,
    };
  } catch (err) {
    return {
      ok: false,
      error: safeError(
        "transcript-add-courses",
        err,
        "We couldn't add those courses. Try again.",
      ),
    };
  }
}

/**
 * Point the profile's rigor counts at what the course plan actually shows.
 *
 * This is the half of the feature that reaches past the planner page. AP and
 * honors counts came from three number fields in onboarding, filled in from
 * memory, and lib/match.ts reads them to decide whether a school is a reach
 * or a target — so a transcript that says nine APs while the profile says
 * four was leaving every chance estimate in the product wrong.
 *
 * GPA is deliberately not touched. The planner says in as many words that
 * chance estimates use the GPA reported in onboarding, and silently
 * replacing that number would move every tier on the list without telling
 * anyone. The counselor is given both figures instead (lib/coursework.ts)
 * and can raise a discrepancy out loud, which is the honest version.
 */
async function syncRigorFromCoursePlan(studentId: string): Promise<RigorCounts> {
  const all = await db
    .select({ level: coursePlanEntries.level })
    .from(coursePlanEntries)
    .where(eq(coursePlanEntries.studentId, studentId));

  // rigorCountsFrom only reads `level`, which is all this query selects.
  const rigor = rigorCountsFrom(all as CoursePlanEntry[]);

  await db
    .update(studentProfiles)
    .set({ ...rigor, updatedAt: new Date() })
    .where(eq(studentProfiles.userId, studentId));

  return rigor;
}

export async function removeTranscriptAction(transcriptId: string): Promise<void> {
  const student = await requireStudent();
  await db
    .delete(transcripts)
    .where(and(eq(transcripts.id, transcriptId), eq(transcripts.studentId, student.userId)));
  revalidatePath("/planner");
}

/* ————————————— Validation ————————————— */

const SUBJECTS = new Set<CoursePlanEntry["subject"]>([
  "English",
  "Math",
  "Science",
  "Social Studies",
  "Language",
  "Arts",
  "Elective",
]);
const LEVELS = new Set<CoursePlanEntry["level"]>(["regular", "honors", "ap", "ib"]);
const YEARS = new Set<GradeLevel>([9, 10, 11, 12]);

function isValidCourse(c: ExtractedCourse): boolean {
  return (
    typeof c?.name === "string" &&
    c.name.trim().length > 0 &&
    YEARS.has(c.year) &&
    SUBJECTS.has(c.subject) &&
    LEVELS.has(c.level)
  );
}
