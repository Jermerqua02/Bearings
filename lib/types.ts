/* ————————————————————————————————————————
   Northstar domain model
   ———————————————————————————————————————— */

export type Role = "student" | "parent";

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
  admissions: {
    acceptanceRate: number; // 0–1
    gpaMid50: [number, number]; // unweighted
    satMid50?: [number, number];
    actMid50?: [number, number];
    testPolicy: TestPolicy;
    plansOffered: ApplicationPlan[];
    deadlines: Partial<Record<ApplicationPlan, string>>; // ISO dates
  };
  cost: {
    stickerPrice: number; // total COA per year
    avgNetPrice: number; // the default number we show
    netPriceByIncome: {
      under48k: number;
      k48to75: number;
      k75to110: number;
      over110k: number;
    };
    percentNeedMet: number; // 0–1
    meritAid: "none" | "limited" | "generous";
  };
  academics: {
    topMajors: string[];
    studentFacultyRatio: string; // "8:1"
    notablePrograms: string[];
    researchOpportunities: boolean;
    coOp: boolean;
  };
  life: {
    vibe: string; // plain language
    greekLifePresence: "none" | "low" | "moderate" | "high";
    d1Athletics: boolean;
    housingGuaranteed: number; // years
    weather: string;
    commonComplaints: string;
    religiousAffiliation?: string;
  };
  cityInfo: {
    costOfLiving: "low" | "moderate" | "high" | "very-high";
    transit: string;
    airportAccess: string;
    internshipMarket: string;
    thingsToDo: string;
  };
  outcomes: {
    gradRate: number; // 6-year, 0–1
    medianEarnings10yr: number;
    alumniNetwork: "regional" | "national" | "global";
  };
  /** Why the counselor might surface this school beyond the obvious. */
  underratedFor?: string;
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
