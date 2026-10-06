/* ————————————————————————————————————————
   Bearings domain model
   ———————————————————————————————————————— */

export type Role = "student" | "parent" | "admin";

/**
 * The roles a person may choose for themselves at signup.
 *
 * Deliberately NOT derived from Role. Admin is granted out of band by
 * scripts/grant-admin.ts or by an existing admin — deriving this list from
 * the type would have made "admin" self-assignable the moment it was added,
 * which is the same shape as the role-escalation hole found in Better Auth's
 * additionalFields.
 */
export const SELF_ASSIGNABLE_ROLES = ["student", "parent"] as const;
export type SelfAssignableRole = (typeof SELF_ASSIGNABLE_ROLES)[number];

export type GradeLevel = 9 | 10 | 11 | 12;

/** The app reshapes itself around these modes. */
export type GradeMode = "build" | "explore" | "apply" | "decide";

export type ChanceTier = "reach" | "target" | "likely";

export type TestPolicy = "required" | "optional" | "blind";

export type CampusSetting = "urban" | "suburban" | "college-town" | "rural";

export type SchoolSize = "small" | "medium" | "large"; // <5k, 5–15k, >15k

export type SchoolType =
  | "private"
  | "public-flagship"
  | "public"
  | "lac" // liberal arts college
  | "tech"
  | "hbcu";

export type Region =
  | "northeast"
  | "mid-atlantic"
  | "south"
  | "midwest"
  | "southwest"
  | "west"
  | "northwest";

export type ApplicationPlan = "ED" | "ED2" | "EA" | "REA" | "RD" | "rolling";

/** Values a student can prioritize during onboarding. */
export type StudentValue =
  | "research-access"
  | "greek-life"
  | "d1-sports"
  | "lgbtq-friendly"
  | "religious-affiliation"
  | "political-climate"
  | "diversity"
  | "study-abroad"
  | "co-op-internships"
  | "mental-health-support";

export interface TestScores {
  sat?: number; // 400–1600
  act?: number; // 1–36
  planningToTest: boolean;
}

export interface Activity {
  id: string;
  name: string;
  role: string;
  hoursPerWeek: number;
  weeksPerYear: number;
  description: string;
  yearsInvolved: GradeLevel[];
  leadership: boolean;
  /**
   * Where this sits when the student ranks their activities by significance,
   * which is the order Common App asks for. Undefined means unranked — the
   * packet keeps entry order rather than asserting one they never gave.
   */
  position?: number;
}

export interface StudentProfile {
  role: "student";
  firstName: string;
  gradeLevel: GradeLevel;
  gpa: { weighted?: number; unweighted?: number };
  rigor: { apCount: number; ibCount: number; honorsCount: number };
  testScores: TestScores;
  intendedMajors: string[]; // empty = undecided, a first-class answer
  undecided: boolean;
  activities: Activity[];
  geography: {
    regions: Region[];
    maxDistanceMiles?: number; // undefined = anywhere
  };
  campus: {
    sizes: SchoolSize[];
    settings: CampusSetting[];
  };
  budget: {
    maxPerYear?: number; // net, per year
    willFileFafsa: boolean;
  };
  values: StudentValue[];
  /** The AI-identified narrative thread. Never a number. */
  throughline?: Throughline;
}

export interface ParentProfile {
  role: "parent";
  firstName: string;
  relationship: string; // "mother", "father", "guardian", …
  studentGrade: GradeLevel;
  budgetPerYear?: number;
  priorities: string[];
  biggestWorry: string;
  involvementLevel: "light-touch" | "regular-check-ins" | "hands-on";
  linkedStudentId?: string;
}

export type Profile = StudentProfile | ParentProfile;

/** Self-understanding, not competitive positioning. */
export interface Throughline {
  paragraph: string;
  evidence: string[]; // 3–4 chips drawn from the profile
  stillForming: boolean; // true for younger students
}

/* ————————————— Schools ————————————— */

export interface School {
  id: string;
  name: string;
  shortName: string;
  city: string;
  state: string;
  region: Region;
  type: SchoolType;
  setting: CampusSetting;
  size: SchoolSize;
  undergradEnrollment: number;
  photoQuery: string; // placeholder image seed until real photos
  /*
    Optional throughout, because sources differ in what they supply. The
    forty hand-written entries have every figure; the ~1,900 institutions
    from College Scorecard have whatever the institution actually reported,
    and coverage is genuinely patchy — a small college may publish a net
    price and no test range.

    `undefined` means "not reported", and the UI has to say that rather than
    print a zero. It is the difference between "we don't know what this
    costs" and "this costs nothing".

    Note there is deliberately no `curated` flag on this type. Whether a
    school was typed by hand or imported is an ingest concern; the product
    shows one set of schools and asks only whether a given fact is known.
  */
  admissions: {
    acceptanceRate?: number; // 0–1
    /** Scorecard publishes no GPA distribution — absent for imported schools. */
    gpaMid50?: [number, number]; // unweighted
    satMid50?: [number, number];
    actMid50?: [number, number];
    testPolicy: TestPolicy;
    plansOffered: ApplicationPlan[];
    deadlines: Partial<Record<ApplicationPlan, string>>; // ISO dates
  };
  cost: {
    stickerPrice?: number; // total COA per year
    avgNetPrice?: number; // the default number we show
    netPriceByIncome: {
      under48k?: number;
      k48to75?: number;
      k75to110?: number;
      over110k?: number;
    };
    percentNeedMet?: number; // 0–1
    meritAid?: "none" | "limited" | "generous";
  };
  academics: {
    topMajors: string[];
    studentFacultyRatio: string; // "8:1"
    notablePrograms: string[];
    researchOpportunities?: boolean;
    coOp?: boolean;
  };
  life: {
    vibe: string; // plain language
    greekLifePresence?: "none" | "low" | "moderate" | "high";
    d1Athletics?: boolean;
    housingGuaranteed?: number; // years
    weather: string;
    commonComplaints: string;
    religiousAffiliation?: string;
  };
  cityInfo: {
    costOfLiving?: "low" | "moderate" | "high" | "very-high";
    transit: string;
    airportAccess: string;
    internshipMarket: string;
    thingsToDo: string;
  };
  outcomes: {
    gradRate?: number; // 6-year, 0–1
    medianEarnings10yr?: number;
    alumniNetwork?: "regional" | "national" | "global";
  };
  /** Why the counselor might surface this school beyond the obvious. */
  underratedFor?: string;
  /*
    What this school asks for, and where to file it.

    Absent when nobody has told us — which is most schools for fee and
    deadline data, and almost none for the requirement questions. Every
    field inside is separately optional for the same reason, and each group
    carries the source it came from so the UI can attribute it.
  */
  application?: SchoolApplication;
}

/** IPEDS's answer to "does this school ask for X". Never a boolean. */
export type Requirement = "required" | "recommended" | "considered" | "not-considered";

export type ApplicationPlatform =
  | "common-app"
  | "coalition"
  | "uc"
  | "cal-state"
  | "applytexas"
  | "direct";

export type FactSource = "ipeds" | "common-app" | "cds" | "curated";

export interface SchoolApplication {
  platform?: ApplicationPlatform;
  url?: string;
  netPriceCalculatorUrl?: string;
  /**
   * True when the school admits all applicants and therefore skips the
   * admissions survey. The requirement fields being empty is then an
   * answer — there is nothing to require — not a gap in our data.
   */
  openAdmissions?: boolean;
  requires: {
    essay?: Requirement;
    recommendations?: Requirement;
    transcript?: Requirement;
    testScores?: Requirement;
    gpa?: Requirement;
    classRank?: Requirement;
  };
  /** Counts and forms, where a source publishes them. */
  teacherRecs?: number;
  otherRecs?: number;
  counselorRec?: boolean;
  midyearReport?: boolean;
  writingSupplement?: boolean;
  coursesAndGrades?: boolean;
  /** "SR" SlideRoom, "COL" the school's own system. */
  portfolio?: string;
  fee?: number;
  feeInternational?: number;
  feeWaiver?: string;
  /** The cycle or survey year the fee describes: "2026-27", or "2023". */
  feeYear?: string;
  /** The survey year the requirement answers describe — not the cycle. */
  requirementsYear?: string;
  sources: {
    requirements?: FactSource;
    supplements?: FactSource;
    fee?: FactSource;
    url?: FactSource;
  };
}

/* ————————————— List & applications ————————————— */

export interface ListEntry {
  schoolId: string;
  tier: ChanceTier;
  plan?: ApplicationPlan;
  status:
    | "considering"
    | "applying"
    | "in-progress"
    | "submitted"
    | "materials-received"
    | "decision";
  outcome?: "accepted" | "waitlisted" | "denied" | "deferred";
  notes?: string;
}

/* ————————————— Weekly check-in ————————————— */

export interface WeeklyCheckIn {
  id: string;
  weekOf: string; // ISO date
  mode: GradeMode;
  actions: { text: string; done: boolean }[];
  dismissed: boolean;
}

/* ————————————— Application data ————————————— */

export interface Essay {
  id: string;
  title: string;
  promptText: string;
  schoolId?: string; // undefined = personal statement
  wordLimit: number;
  text: string;
  versions: { id: string; text: string; savedAt: string }[];
}

export interface Recommender {
  id: string;
  name: string;
  roleTitle: string; // "AP Bio teacher"
  /** The application asks for this to send the invite. Empty until given. */
  email: string;
  type: "teacher" | "counselor" | "other";
  schoolIds: string[];
  status: "invited" | "in-progress" | "submitted";
}

export interface UniversalProfile {
  legalName: string;
  preferredName: string;
  dateOfBirth: string;
  email: string;
  phone: string;
  address: string;
  citizenship: string;
  demographics: string;
  parentEducation: string;
  highSchoolName: string;
  highSchoolCity: string;
  gradYear: string;
  honors: string[];
  additionalInfo: string;
}

export interface AidStatus {
  fafsa: "not-started" | "in-progress" | "submitted";
  cssProfile: "not-needed" | "not-started" | "in-progress" | "submitted";
}

export interface AidOffer {
  schoolId: string;
  coa: number; // total cost of attendance / yr
  grants: number; // free money / yr
  loans: number; // offered loans / yr
  workStudy: number; // per yr
}

export interface CoursePlanEntry {
  id: string;
  year: GradeLevel;
  subject:
    | "English"
    | "Math"
    | "Science"
    | "Social Studies"
    | "Language"
    | "Arts"
    | "Elective";
  name: string;
  level: "regular" | "honors" | "ap" | "ib";
  status: "completed" | "in-progress" | "planned";
  grade?: string; // letter grade if completed
  /**
   * The grading period this row covers — "S1", "06/2022", "Quarter 3".
   *
   * Transcripts are organised by term, not by course: a year-long English
   * class is two rows with two different grades. Without the term those
   * rows render as the same course listed twice, which is what a real
   * transcript upload looked like — "English 9" three times, apparently
   * duplicated, actually three separate semester grades.
   */
  term?: string;
  /** Credits earned, as the transcript states them. Used to weight GPA. */
  credits?: number;
}

/**
 * The GPA a transcript prints for itself.
 *
 * This is the number that matters — it is what the school reports, what the
 * counselor quotes, and what goes on an application. Any GPA we compute from
 * extracted rows is a reconstruction, and it will drift: schools exclude
 * pass/fail courses, weight by credit, count or ignore middle-school credit,
 * and apply their own scale. When the document states its own figure, that
 * figure wins.
 */
export interface ReportedGpa {
  unweighted: number | null;
  weighted: number | null;
  /** Total credits the GPA was computed over, if printed. */
  credits: number | null;
}

/**
 * A transcript the student uploaded, without its bytes.
 *
 * The file itself is never sent to the browser as part of the snapshot —
 * it's several hundred KB and nothing on the page renders it. The download
 * link fetches it on demand from /api/transcript/[id].
 */
export interface TranscriptFile {
  id: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  uploadedAt: string;
  /** Null until the file has been read; the count of courses found. */
  courseCount: number | null;
  /** The GPA printed on the document itself. Nulls until read. */
  reportedGpa: ReportedGpa;
}

/**
 * One course as the model read it off a transcript.
 *
 * Deliberately not a CoursePlanEntry: this is a *claim* about what a
 * document says, not a row in the student's record. It becomes an entry
 * only when the student confirms it, which is why it carries `term` and
 * `credits` — context that helps them check the reading — and no id.
 */
export interface ExtractedCourse {
  year: GradeLevel;
  subject: CoursePlanEntry["subject"];
  name: string;
  level: CoursePlanEntry["level"];
  /** Letter grade as printed, or undefined if the course has no grade yet. */
  grade?: string;
  /** "Fall 2024", "Semester 1" — whatever the document called it. */
  term?: string;
  credits?: number;
}

export interface Opportunity {
  id: string;
  name: string;
  org: string;
  type: "program" | "internship" | "research" | "job" | "volunteering";
  cost: "free" | "low-cost" | "paid" | "stipend";
  selective: boolean;
  location: string;
  interests: string[];
  description: string;
}

/* ————————————— Helpers ————————————— */

/** Derive the app's mode from grade level and time of year. */
export function gradeModeFor(grade: GradeLevel, date = new Date()): GradeMode {
  if (grade <= 10) return "build";
  if (grade === 11) return "explore";
  // 12th grade: fall = apply, spring = decide
  const month = date.getMonth(); // 0-indexed
  return month >= 7 || month === 0 ? "apply" : "decide"; // Aug–Jan apply, Feb–Jul decide
}

export const gradeModeLabel: Record<GradeMode, string> = {
  build: "Build",
  explore: "Explore",
  apply: "Apply",
  decide: "Decide",
};
