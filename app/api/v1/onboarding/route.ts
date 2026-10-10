/* ————————————————————————————————————————
   POST /api/v1/onboarding  { …profile } → { summary }

   The app's first meeting: the same write as completeOnboardingAction
   (saveProfile, an upsert, so running it again corrects rather than
   collides), then the same summary the web shows on its last screen.

   The role is the account's, not the body's — a student account can't save
   itself a parent profile. Admins pick, as they do on the web.

   Every field is checked here because the body comes off the wire: a GPA
   of "about 3.7" in a numeric column is a database error, and a region the
   matcher doesn't know would quietly skew every result.
   ———————————————————————————————————————— */

import { requireViewer } from "@/lib/auth/policy";
import { BadRequest, body, oneOf, route } from "@/lib/api/v1";
import { summarizeProfileAction } from "@/lib/actions/counselor";
import { saveProfile } from "@/lib/db/queries/profile";
import { localSummary } from "@/lib/onboarding-summary";
import { isUsState } from "@/lib/states";
import type {
  CampusSetting,
  GradeLevel,
  ParentProfile,
  Profile,
  Region,
  StudentProfile,
  StudentValue,
} from "@/lib/types";

export const runtime = "nodejs";

const REGIONS: readonly Region[] = ["northeast", "mid-atlantic", "south", "midwest", "southwest", "west", "northwest"];
const SETTINGS: readonly CampusSetting[] = ["urban", "suburban", "college-town", "rural"];
const VALUES: readonly StudentValue[] = [
  "research-access", "greek-life", "d1-sports", "lgbtq-friendly", "religious-affiliation",
  "political-climate", "diversity", "study-abroad", "co-op-internships", "mental-health-support",
];
const INVOLVEMENT = ["light-touch", "regular-check-ins", "hands-on"] as const;

export const POST = route("onboarding", "We couldn't save your answers. Try again.", async (request) => {
  const viewer = await requireViewer();
  const b = await body(request);
  const role = viewer.role === "admin" ? oneOf(b.role, ["student", "parent"] as const, "role") : viewer.role;

  const profile: Profile = role === "parent" ? parentFrom(b) : studentFrom(b);
  await saveProfile(viewer.userId, profile);

  // The model's version is Pro (and can fail); the plain one is the floor,
  // exactly as on the web's last screen.
  let summary = localSummary(profile);
  try {
    summary = (await summarizeProfileAction())?.trim() || summary;
  } catch {
    // Free, rate-limited or the model is down: the plain summary stands.
  }
  return { summary };
});

function studentFrom(b: Record<string, unknown>): StudentProfile {
  const gpa = obj(b.gpa);
  const rigor = obj(b.rigor);
  const tests = obj(b.testScores);
  const budget = obj(b.budget);
  const majors = strings(b.intendedMajors, "intendedMajors");
  return {
    role: "student",
    firstName: name(b.firstName),
    gradeLevel: grade(b.gradeLevel),
    gpa: { unweighted: num(gpa.unweighted, 0, 5, "GPA"), weighted: num(gpa.weighted, 0, 5, "GPA") },
    rigor: {
      apCount: num(rigor.apCount, 0, 30, "AP count") ?? 0,
      ibCount: 0,
      honorsCount: num(rigor.honorsCount, 0, 30, "honors count") ?? 0,
    },
    testScores: {
      sat: num(tests.sat, 400, 1600, "SAT score"),
      act: num(tests.act, 1, 36, "ACT score"),
      planningToTest: tests.planningToTest !== false,
    },
    intendedMajors: majors,
    undecided: b.undecided === true || majors.length === 0,
    // Not saved by saveProfile on either client; activities have their own table.
    activities: [],
    geography: { regions: strings(b.regions, "regions").map((r) => oneOf(r, REGIONS, "region")) },
    campus: { sizes: [], settings: strings(b.settings, "settings").map((s) => oneOf(s, SETTINGS, "setting")) },
    budget: {
      maxPerYear: num(budget.maxPerYear, 0, 1_000_000, "budget"),
      willFileFafsa: budget.willFileFafsa !== false,
    },
    homeState: isUsState(b.homeState) ? b.homeState : undefined,
    values: strings(b.values, "values").map((v) => oneOf(v, VALUES, "value")),
  };
}

function parentFrom(b: Record<string, unknown>): ParentProfile {
  return {
    role: "parent",
    firstName: name(b.firstName),
    relationship: typeof b.relationship === "string" ? b.relationship.trim().slice(0, 40) || "parent" : "parent",
    studentGrade: grade(b.studentGrade),
    budgetPerYear: num(b.budgetPerYear, 0, 1_000_000, "budget"),
    priorities: strings(b.priorities, "priorities"),
    biggestWorry: typeof b.biggestWorry === "string" ? b.biggestWorry.trim().slice(0, 2000) : "",
    involvementLevel: oneOf(b.involvementLevel ?? "regular-check-ins", INVOLVEMENT, "involvement"),
    homeState: isUsState(b.homeState) ? b.homeState : undefined,
  };
}

function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function name(v: unknown): string {
  const s = typeof v === "string" ? v.trim().slice(0, 60) : "";
  if (!s) throw new BadRequest("Tell us what to call you.");
  return s;
}

function grade(v: unknown): GradeLevel {
  if (v === 9 || v === 10 || v === 11 || v === 12) return v;
  throw new BadRequest("Pick a grade from 9th to 12th.");
}

/** Undefined when absent; a 400 when present but not a number in range. */
function num(v: unknown, min: number, max: number, field: string): number | undefined {
  if (v === undefined || v === null) return undefined;
  if (typeof v !== "number" || !Number.isFinite(v) || v < min || v > max) {
    throw new BadRequest(`That ${field} doesn't look right.`);
  }
  return v;
}

/** A short list of short strings, or a 400. */
function strings(v: unknown, field: string): string[] {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v) || v.length > 20 || !v.every((x) => typeof x === "string" && x.length <= 80)) {
    throw new BadRequest(`Invalid ${field}.`);
  }
  return v as string[];
}
