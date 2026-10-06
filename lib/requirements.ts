/* ————————————————————————————————————————
   What a school asks for, in words a student can act on.

   This replaces `requirementsFor()`, which derived the whole picture from
   whether a school was private: two teacher recs and a $75 fee for anything
   non-public, one rec for a flagship, none for a public. A student read
   "2 teacher recs · $75 fee" as a fact about that college. It was a guess.

   Three rules hold everything here together.

   A missing answer produces no line at all. Not "0 recommendations", not
   "no essay required" — nothing. The product's standing rule is that a
   schema default is never presented as a finding, and the place that rule
   matters most is the screen a student works from in October.

   "Not considered" is not the same as "not required", and both differ from
   "we don't know". IPEDS distinguishes a school that ignores test scores
   entirely from one that reads them if you send them, and labels those Test
   Blind and Test Optional. Collapsing them would tell a student not to
   bother with the SAT at a school that would happily read it.

   Every line can say where it came from. With coverage this uneven, the
   answer to "how do you know?" has to exist.
   ———————————————————————————————————————— */

import { NOT_REPORTED, formatDollars } from "@/lib/format";
import { CURRENT_CYCLE } from "@/lib/schools";
import type { Essay, FactSource, Recommender, Requirement, School } from "@/lib/types";

export interface RequirementLine {
  key: string;
  label: string;
  /** Rendered verbatim. Absent requirements never reach here. */
  status: string;
  /** Extra detail a second source supplied, e.g. "2 teachers + counselor". */
  detail?: string;
  /** True when the student's own records already satisfy this. */
  done?: boolean;
  /** Emphasis: something they must produce, versus something they may. */
  mandatory: boolean;
}

/**
 * How each of IPEDS's four answers reads on screen.
 *
 * The wording for `not-considered` is IPEDS's own 2022 restatement. The
 * Urban Institute's codebook still labels it "neither required nor
 * recommended", which understates it — the school is saying it will not look.
 */
const STATUS: Record<Requirement, { text: string; mandatory: boolean }> = {
  required: { text: "Required", mandatory: true },
  recommended: { text: "Recommended", mandatory: false },
  considered: { text: "Optional — considered if you submit it", mandatory: false },
  "not-considered": { text: "Not considered, even if you submit it", mandatory: false },
};

const SOURCE_NAME: Record<FactSource, string> = {
  ipeds: "the U.S. Department of Education",
  "common-app": "Common App",
  cds: "this school's Common Data Set",
  curated: "our own research",
};

interface Context {
  essays: Essay[];
  recommenders: Recommender[];
}

/** A teacher-rec count only counts letters the student has actually assigned. */
function recsFor(schoolId: string, recommenders: Recommender[]): number {
  return recommenders.filter((r) => r.schoolIds.includes(schoolId)).length;
}

function essayStarted(schoolId: string, essays: Essay[]): boolean {
  return essays.some((e) => e.schoolId === schoolId && e.text.trim().length > 50);
}

/**
 * The checklist for one school.
 *
 * Returns an empty array when nothing is known, which the caller must treat
 * as "say we don't know" rather than "this school asks for nothing".
 */
export function requirementLines(school: School, ctx: Context): RequirementLine[] {
  const app = school.application;
  if (!app) return [];

  const lines: RequirementLine[] = [];
  const req = app.requires;

  if (req.essay) {
    const s = STATUS[req.essay];
    lines.push({
      key: "essay",
      label: "Personal essay",
      status: s.text,
      mandatory: s.mandatory,
      done: s.mandatory ? essayStarted(school.id, ctx.essays) : undefined,
    });
  }

  if (app.writingSupplement) {
    lines.push({
      key: "supplement",
      label: "Writing supplement",
      status: "Required by this school",
      mandatory: true,
      done: essayStarted(school.id, ctx.essays),
    });
  }

  if (req.recommendations) {
    const s = STATUS[req.recommendations];
    // Common App publishes the actual count; IPEDS only says whether any are
    // wanted. Show the number only when a source gave us one.
    const parts: string[] = [];
    if (app.teacherRecs != null && app.teacherRecs > 0) {
      parts.push(`${app.teacherRecs} teacher${app.teacherRecs === 1 ? "" : "s"}`);
    }
    if (app.counselorRec) parts.push("counselor");
    if (app.otherRecs != null && app.otherRecs > 0) parts.push(`${app.otherRecs} other`);

    const needed = app.teacherRecs ?? 0;
    lines.push({
      key: "recs",
      label: "Letters of recommendation",
      status: s.text,
      detail: parts.length ? parts.join(" + ") : undefined,
      mandatory: s.mandatory,
      done: s.mandatory && needed > 0 ? recsFor(school.id, ctx.recommenders) >= needed : undefined,
    });
  }

  if (req.transcript) {
    const s = STATUS[req.transcript];
    lines.push({ key: "transcript", label: "Transcript", status: s.text, mandatory: s.mandatory });
  }

  if (app.coursesAndGrades) {
    lines.push({
      key: "courses",
      label: "Self-reported courses & grades",
      status: "Required by this school",
      mandatory: true,
    });
  }

  if (req.testScores) {
    const s = STATUS[req.testScores];
    lines.push({
      key: "tests",
      label: "SAT / ACT scores",
      status: s.text,
      mandatory: s.mandatory,
    });
  }

  if (app.midyearReport) {
    lines.push({
      key: "midyear",
      label: "Mid-year report",
      status: "Required by this school",
      mandatory: true,
    });
  }

  if (app.portfolio) {
    lines.push({
      key: "portfolio",
      label: "Portfolio",
      status: app.portfolio === "SR" ? "Collected through SlideRoom" : "Collected by the school",
      mandatory: false,
    });
  }

  return lines;
}

/**
 * The fee, or an honest admission that nobody has told us.
 *
 * `asOf` is set whenever the figure describes a year other than the cycle a
 * student is applying in. The federal survey stopped collecting application
 * fees after 2023, so roughly a third of these are three years old.
 *
 * `mayHaveDropped` marks the ones actually worth re-checking, and it is set
 * asymmetrically because the error is asymmetric. Measured against the 578
 * fees we hold from Common App's current grid: of the schools charging a fee
 * in 2023, **18% now charge nothing**, while only 1.2% went the other way.
 * Colleges have been dropping application fees, not adding them.
 *
 * So a stale `$0` is close to safe and gets no warning, while a stale charge
 * is the one that can wrongly tell a student an application costs money it
 * doesn't — the error that stops someone applying at all. Warning on both
 * would put a caveat on 546 reliable figures and teach students to ignore it.
 */
export function feeLabel(school: School): {
  text: string;
  known: boolean;
  /** Present only when the figure predates the current cycle. */
  asOf?: string;
  /** A stale charge, which may since have been dropped. */
  mayHaveDropped?: boolean;
} {
  const app = school.application;
  const fee = app?.fee;
  if (fee == null) return { text: NOT_REPORTED, known: false };
  const text = fee === 0 ? "No application fee" : formatDollars(fee);
  const year = app?.feeYear;
  const stale = !!year && year !== CURRENT_CYCLE;
  return {
    text,
    known: true,
    asOf: stale ? year : undefined,
    mayHaveDropped: stale && fee > 0 ? true : undefined,
  };
}

/**
 * Whether the empty checklist means "nothing to require" or "we weren't told".
 *
 * A school with open admissions skips the admissions survey entirely, so its
 * requirements are blank by design. Saying "not reported" there would be
 * both wrong and discouraging.
 */
export function emptyReason(school: School): "open-admission" | "unknown" {
  return school.application?.openAdmissions ? "open-admission" : "unknown";
}

/** "According to Common App, updated for 2026-27." */
export function attribution(school: School): string | null {
  const app = school.application;
  if (!app) return null;
  const src = app.sources.requirements ?? app.sources.supplements ?? app.sources.fee;
  if (!src) return null;
  const year = app.requirementsYear;
  return `According to ${SOURCE_NAME[src]}${year ? `, ${year} figures` : ""}.`;
}

/** Where the student actually files, and what to call it. */
const PLATFORM_NAME: Record<string, string> = {
  "common-app": "Common App",
  coalition: "Coalition",
  uc: "the UC application",
  "cal-state": "Cal State Apply",
  applytexas: "ApplyTexas",
};

const PLATFORM_URL: Record<string, string> = {
  "common-app": "https://www.commonapp.org/apply",
  coalition: "https://www.coalitionforcollegeaccess.org/",
};

export interface ApplyRoute {
  href: string;
  label: string;
  /** The shared platform, as opposed to the school's own form. */
  shared: boolean;
}

/** "https://www.commonapp.org/apply" → "commonapp.org" */
function host(url: string): string | null {
  try {
    const h = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    const parts = h.split(".");
    return parts.length <= 2 ? h : parts.slice(-2).join(".");
  } catch {
    return null;
  }
}

/**
 * Every way in to this school's application, not just one.
 *
 * A Common App member usually also runs its own form, and which route a
 * student takes changes what they have to fill in. Showing only one hides a
 * real choice — and picking the wrong one to show is worse for the schools
 * that are *not* members, where sending someone to Common App is a dead end.
 *
 * Membership comes from Common App's own published grid. It is not inferred
 * from the application URL: the federal directory lists each school's own
 * admissions page, so member schools look identical to non-members there.
 */
export function applyRoutes(school: School): ApplyRoute[] {
  const app = school.application;
  if (!app) return [];

  const out: ApplyRoute[] = [];
  const platform = app.platform;
  const named = platform ? PLATFORM_NAME[platform] : undefined;
  const sharedUrl = platform ? PLATFORM_URL[platform] : undefined;

  if (named && sharedUrl) {
    out.push({ href: sharedUrl, label: `Apply on ${named}`, shared: true });
  } else if (named && app.url) {
    // UC, Cal State and ApplyTexas route through one address, which the
    // federal directory already gives us — there is no separate school form.
    out.push({ href: app.url, label: `Apply on ${named}`, shared: true });
  }

  // Compared by host, not by string. Some schools list the platform itself as
  // their application URL — Stanford's federal entry is commonapp.org — and an
  // exact-match check would offer that back as "Stanford's own form", which
  // is the same door wearing a different label.
  const shownHosts = new Set(out.map((r) => host(r.href)).filter(Boolean));
  if (app.url && !shownHosts.has(host(app.url))) {
    out.push({
      href: app.url,
      label: out.length ? `Or ${school.shortName}'s own form` : `Apply on ${school.shortName}'s site`,
      shared: false,
    });
  }

  return out;
}
