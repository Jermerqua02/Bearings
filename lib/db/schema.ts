/* ————————————————————————————————————————
   Lumni database schema.

   Mirrors lib/types.ts, which stays the source of truth for the domain
   model. Where this file deliberately diverges from the in-memory shapes,
   the reason is noted inline.

   Conventions:
   - uuid primary keys everywhere except `schools`/`opportunities`, whose
     human slugs ("umich", "case-western") are referenced by list entries,
     aid offers, and counselor cards.
   - createdAt / updatedAt on every table. The in-memory model had neither.
   - Enums are Postgres enums so the DB rejects values the UI can't render.
   ———————————————————————————————————————— */

import {
  doublePrecision,
  boolean,
  customType,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

/* ————————————— Enums ————————————— */

export const roleEnum = pgEnum("role", ["student", "parent", "admin"]);
export const gradeModeEnum = pgEnum("grade_mode", ["build", "explore", "apply", "decide"]);
export const chanceTierEnum = pgEnum("chance_tier", ["reach", "target", "likely"]);
export const testPolicyEnum = pgEnum("test_policy", ["required", "optional", "blind"]);
export const campusSettingEnum = pgEnum("campus_setting", [
  "urban",
  "suburban",
  "college-town",
  "rural",
]);
export const schoolSizeEnum = pgEnum("school_size", ["small", "medium", "large"]);
export const schoolTypeEnum = pgEnum("school_type", [
  "private",
  "public-flagship",
  "public",
  "lac",
  "tech",
  "hbcu",
]);
export const regionEnum = pgEnum("region", [
  "northeast",
  "mid-atlantic",
  "south",
  "midwest",
  "southwest",
  "west",
  "northwest",
]);
export const applicationPlanEnum = pgEnum("application_plan", [
  "ED",
  "ED2",
  "EA",
  "REA",
  "RD",
  "rolling",
]);

/**
 * Where a student actually files. This is the *platform*, not the plan —
 * `applicationPlanEnum` above is ED/EA/RD, which is a different question.
 *
 * Derived by clustering the application URLs: a hostname shared by many
 * schools is a platform, and the systems that matter here (UC, Cal State,
 * ApplyTexas) all route their campuses through one address.
 */
export const applicationPlatformEnum = pgEnum("application_platform", [
  "common-app",
  "coalition",
  "uc",
  "cal-state",
  "applytexas",
  "direct",
]);

/**
 * IPEDS's four answers to "does this school require X", in the wording the
 * 2022 survey restated them to.
 *
 * Not a boolean, deliberately. Collapsing this to yes/no loses the single
 * most decision-relevant distinction in the dataset: a school that ignores
 * test scores entirely ("not-considered", which IPEDS labels *Test Blind*)
 * and one that reads them if you send them ("considered", labelled *Test
 * Optional*) are opposite advice for a student deciding whether to sit the
 * SAT, and a boolean makes them the same cell.
 *
 * `recommended` is retained for completeness but does not occur in 2022 or
 * later — IPEDS dropped it when it added "considered but not required".
 */
export const requirementEnum = pgEnum("requirement", [
  "required",
  "recommended",
  "considered",
  "not-considered",
]);

/**
 * Which source a group of facts came from, so the UI can attribute them.
 *
 * With coverage this uneven, a fact with no source is not shippable: the
 * product's rule is that a default is never presented as an answer, and
 * "$75" with nothing behind it is exactly the defect this table replaces.
 */
export const factSourceEnum = pgEnum("fact_source", [
  "ipeds",
  "common-app",
  "cds",
  "curated",
]);
export const listStatusEnum = pgEnum("list_status", [
  "considering",
  "applying",
  "in-progress",
  "submitted",
  "materials-received",
  "decision",
]);
export const listOutcomeEnum = pgEnum("list_outcome", [
  "accepted",
  "waitlisted",
  "denied",
  "deferred",
]);
export const recommenderTypeEnum = pgEnum("recommender_type", ["teacher", "counselor", "other"]);
export const recommenderStatusEnum = pgEnum("recommender_status", [
  "invited",
  "in-progress",
  "submitted",
]);
export const fafsaStatusEnum = pgEnum("fafsa_status", ["not-started", "in-progress", "submitted"]);
export const cssStatusEnum = pgEnum("css_status", [
  "not-needed",
  "not-started",
  "in-progress",
  "submitted",
]);
export const courseSubjectEnum = pgEnum("course_subject", [
  "English",
  "Math",
  "Science",
  "Social Studies",
  "Language",
  "Arts",
  "Elective",
]);
export const courseLevelEnum = pgEnum("course_level", ["regular", "honors", "ap", "ib"]);
export const courseStatusEnum = pgEnum("course_status", ["completed", "in-progress", "planned"]);
export const meritAidEnum = pgEnum("merit_aid", ["none", "limited", "generous"]);
export const greekPresenceEnum = pgEnum("greek_presence", ["none", "low", "moderate", "high"]);
export const costOfLivingEnum = pgEnum("cost_of_living", ["low", "moderate", "high", "very-high"]);
export const alumniNetworkEnum = pgEnum("alumni_network", ["regional", "national", "global"]);
export const opportunityTypeEnum = pgEnum("opportunity_type", [
  "program",
  "internship",
  "research",
  "job",
  "volunteering",
]);
export const opportunityCostEnum = pgEnum("opportunity_cost", [
  "free",
  "low-cost",
  "paid",
  "stipend",
]);
export const involvementEnum = pgEnum("involvement_level", [
  "light-touch",
  "regular-check-ins",
  "hands-on",
]);
export const linkStatusEnum = pgEnum("link_status", ["invited", "active", "revoked"]);
export const legalDocumentEnum = pgEnum("legal_document", ["terms", "privacy"]);
export const messageAuthorEnum = pgEnum("message_author", ["user", "counselor"]);

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

/* ————————————————————————————————————————
   Better Auth core tables.

   Shapes required by better-auth; `role` is our additionalField.
   ———————————————————————————————————————— */

export const users = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  role: roleEnum("role").notNull().default("student"),
  ...timestamps,
});

export const sessions = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  token: text("token").notNull().unique(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  ...timestamps,
});

export const accounts = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
  scope: text("scope"),
  password: text("password"),
  ...timestamps,
});

export const verifications = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  ...timestamps,
});

/* ————————————————————————————————————————
   The parent ⇄ student link.

   Replaces the `parentLinked: boolean` in profile-context. Student-initiated
   and student-revocable, because the settings copy promises the student
   controls it. Revocation is a status change, not a delete, so the history
   survives an audit.
   ———————————————————————————————————————— */

export const parentStudentLinks = pgTable(
  "parent_student_link",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    studentId: text("student_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    parentId: text("parent_id").references(() => users.id, { onDelete: "cascade" }),
    // Set before the parent has an account; the invite is claimed on signup.
    parentEmail: text("parent_email").notNull(),
    status: linkStatusEnum("status").notNull().default("invited"),
    inviteToken: text("invite_token").notNull().unique(),
    invitedAt: timestamp("invited_at", { withTimezone: true }).notNull().defaultNow(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index("psl_student_idx").on(t.studentId),
    index("psl_parent_idx").on(t.parentId),
    // One live link per student/parent pair; revoked rows are kept for history.
    unique("psl_unique_pair").on(t.studentId, t.parentEmail),
  ],
);

/* ————————————————————————————————————————
   Profiles
   ———————————————————————————————————————— */

export const studentProfiles = pgTable("student_profile", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  firstName: text("first_name").notNull(),
  gradeLevel: integer("grade_level").notNull(), // 9–12

  // Onboarding's self-reported figure. The Planner derives a second GPA from
  // course_plan_entry letter grades; both are surfaced rather than silently
  // picking a winner, so this column is explicitly named self-reported.
  selfReportedGpaWeighted: doublePrecision("self_reported_gpa_weighted"),
  selfReportedGpaUnweighted: doublePrecision("self_reported_gpa_unweighted"),

  apCount: integer("ap_count").notNull().default(0),
  ibCount: integer("ib_count").notNull().default(0),
  honorsCount: integer("honors_count").notNull().default(0),

  sat: integer("sat"),
  act: integer("act"),
  planningToTest: boolean("planning_to_test").notNull().default(false),

  intendedMajors: text("intended_majors").array().notNull().default([]),
  undecided: boolean("undecided").notNull().default(false),

  regions: regionEnum("regions").array().notNull().default([]),
  maxDistanceMiles: integer("max_distance_miles"),
  campusSizes: schoolSizeEnum("campus_sizes").array().notNull().default([]),
  campusSettings: campusSettingEnum("campus_settings").array().notNull().default([]),

  budgetMaxPerYear: integer("budget_max_per_year"),
  willFileFafsa: boolean("will_file_fafsa").notNull().default(false),

  // Two-letter USPS code. Decides in-state vs out-of-state tuition at every
  // public school, and which regional exchanges (WUE and the like) apply.
  // Null for profiles made before it was asked — the app asks once.
  homeState: text("home_state"),

  values: text("values").array().notNull().default([]),

  // Throughline: AI-generated but must persist. generatedAt lets us tell when
  // it has drifted from the profile it was derived from.
  throughlineParagraph: text("throughline_paragraph"),
  throughlineEvidence: text("throughline_evidence").array(),
  throughlineStillForming: boolean("throughline_still_forming"),
  throughlineGeneratedAt: timestamp("throughline_generated_at", { withTimezone: true }),

  ...timestamps,
});

export const parentProfiles = pgTable("parent_profile", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  firstName: text("first_name").notNull(),
  relationship: text("relationship").notNull(),
  studentGrade: integer("student_grade").notNull(),
  budgetPerYear: integer("budget_per_year"),
  priorities: text("priorities").array().notNull().default([]),
  biggestWorry: text("biggest_worry").notNull().default(""),
  involvementLevel: involvementEnum("involvement_level").notNull().default("regular-check-ins"),
  ...timestamps,
});

/* ————————————————————————————————————————
   Reference data — schools.

   Split off the sub-objects that are cycle- or year-scoped so next year's
   figures are a new row rather than a migration.
   ———————————————————————————————————————— */

export const schools = pgTable("school", {
  id: text("id").primaryKey(), // slug: "umich", "case-western"
  name: text("name").notNull(),
  shortName: text("short_name").notNull(),
  city: text("city").notNull(),
  state: text("state").notNull(),
  region: regionEnum("region").notNull(),
  type: schoolTypeEnum("type").notNull(),
  setting: campusSettingEnum("setting").notNull(),
  size: schoolSizeEnum("size").notNull(),
  undergradEnrollment: integer("undergrad_enrollment").notNull(),
  photoQuery: text("photo_query").notNull().default(""),
  /** Bare hostname, e.g. "umich.edu". The key we fetch a logo by. */
  website: text("website"),
  /** IPEDS UNITID from College Scorecard — the join key back to the source. */
  ipedsId: integer("ipeds_id"),
  /**
   * Hand-written, and never overwritten by an import.
   *
   * This used to be inferred from `ipeds_id IS NULL`, which conflated two
   * different facts: "we wrote this by hand" and "we haven't matched it to a
   * federal record yet". The moment the importer learned to stamp an IPEDS id
   * onto a curated row, the inference broke and the row lost its protection —
   * so the next run would have inserted a second copy of it without the
   * editorial columns. Curation is its own property; it gets its own column.
   */
  curated: boolean("curated").notNull().default(false),

  // Academics
  topMajors: text("top_majors").array().notNull().default([]),
  studentFacultyRatio: text("student_faculty_ratio").notNull().default(""),
  notablePrograms: text("notable_programs").array().notNull().default([]),
  /*
    Nullable, like every other figure a source might not supply.

    These were `NOT NULL DEFAULT false` (and 'low', 'moderate', 0 below),
    which made a default indistinguishable from an answer: an imported
    school would report "Research access: Limited" because nobody had said
    otherwise, not because anyone looked. The UI worked around it by hiding
    these fields for anything not hand-written, which quietly split the
    product in two — forty real schools and 1,900 thin ones.

    A school is a school. What varies is how much we know about it, and
    that is what null is for.
  */
  researchOpportunities: boolean("research_opportunities"),
  coOp: boolean("co_op"),

  // Life
  vibe: text("vibe").notNull().default(""),
  greekLifePresence: greekPresenceEnum("greek_life_presence"),
  d1Athletics: boolean("d1_athletics"),
  housingGuaranteed: integer("housing_guaranteed"),
  weather: text("weather").notNull().default(""),
  commonComplaints: text("common_complaints").notNull().default(""),
  religiousAffiliation: text("religious_affiliation"),

  // City
  costOfLiving: costOfLivingEnum("cost_of_living"),
  transit: text("transit").notNull().default(""),
  airportAccess: text("airport_access").notNull().default(""),
  internshipMarket: text("internship_market").notNull().default(""),
  thingsToDo: text("things_to_do").notNull().default(""),

  // An editor's note on who this school is underrated for. A nudge in
  // lib/picks.ts when the school already clears the bar for a student.
  underratedFor: text("underrated_for"),

  ...timestamps,
});

/*
  Nullability here tracks what a real source can actually supply.

  The curated forty were hand-written, so every number existed and every
  column could be NOT NULL. College Scorecard covers ~1,900 institutions and
  its coverage is patchy — a small college may report a net price and no test
  range, or an admit rate and no earnings figure. It publishes no GPA
  distribution at all.

  A missing number has to be storable as missing. The alternative is either
  dropping the school from the product or inventing a figure to satisfy the
  column, and inventing one is worse: it would be displayed to a student as
  fact, next to their own real GPA.
*/
export const schoolAdmissions = pgTable(
  "school_admissions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    schoolId: text("school_id")
      .notNull()
      .references(() => schools.id, { onDelete: "cascade" }),
    cycle: text("cycle").notNull(), // "2026-27"
    acceptanceRate: doublePrecision("acceptance_rate"),
    /** Scorecard has no GPA data. Null for every imported school. */
    gpaMid50Low: doublePrecision("gpa_mid50_low"),
    gpaMid50High: doublePrecision("gpa_mid50_high"),
    satMid50Low: integer("sat_mid50_low"),
    satMid50High: integer("sat_mid50_high"),
    actMid50Low: integer("act_mid50_low"),
    actMid50High: integer("act_mid50_high"),
    testPolicy: testPolicyEnum("test_policy").notNull(),
    plansOffered: applicationPlanEnum("plans_offered").array().notNull().default([]),
    ...timestamps,
  },
  (t) => [unique("school_admissions_cycle").on(t.schoolId, t.cycle)],
);

/*
  What a school asks an applicant for, and where they file it.

  This replaces a function that derived requirements from whether a school
  was private: two teacher recs and a $75 fee for anything non-public, a $50
  fee otherwise. A student read that as a fact about the college. It was a
  guess, and being wrong here costs an unwritten essay or a missed fee.

  Every column is nullable and every group carries its source, because the
  coverage is genuinely uneven — IPEDS answers the requirement questions for
  nearly every school, Common App carries fee and deadline data for its
  members only, and the rest is unknown until someone reads a Common Data
  Set. A null here means "we have not been told", and the UI must say that
  rather than fill it in.

  `openAdmissions` is the exception worth reading carefully: when it is true,
  the requirement columns are null because the school skips the admissions
  survey entirely — there is nothing to require. That is an answer, not a
  gap, and it reads differently to a student.
*/
export const schoolApplications = pgTable(
  "school_application",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    schoolId: text("school_id")
      .notNull()
      .references(() => schools.id, { onDelete: "cascade" }),
    cycle: text("cycle").notNull(), // "2026-27"

    /* Where to apply. */
    platform: applicationPlatformEnum("platform"),
    applicationUrl: text("application_url"),
    netPriceCalculatorUrl: text("net_price_calculator_url"),
    urlSource: factSourceEnum("url_source"),

    /* What they ask for — IPEDS, whose survey year is not our cycle. */
    openAdmissions: boolean("open_admissions"),
    reqEssay: requirementEnum("req_essay"),
    reqRecommendations: requirementEnum("req_recommendations"),
    reqTranscript: requirementEnum("req_transcript"),
    reqTestScores: requirementEnum("req_test_scores"),
    reqGpa: requirementEnum("req_gpa"),
    reqClassRank: requirementEnum("req_class_rank"),
    requirementsSource: factSourceEnum("requirements_source"),
    /** The survey year these answers describe, e.g. "2022". Not the cycle. */
    requirementsYear: text("requirements_year"),

    /* How many, and which forms — Common App's grid, for its members. */
    teacherRecs: integer("teacher_recs"),
    otherRecs: integer("other_recs"),
    counselorRec: boolean("counselor_rec"),
    midyearReport: boolean("midyear_report"),
    writingSupplement: boolean("writing_supplement"),
    coursesAndGrades: boolean("courses_and_grades"),
    /** "SR" SlideRoom, "COL" the school's own system, null if none collected. */
    portfolio: text("portfolio"),
    supplementsSource: factSourceEnum("supplements_source"),

    /* What it costs. Nothing in IPEDS after 2023; Common App or a Data Set. */
    feeUsd: integer("fee_usd"),
    feeInternationalUsd: integer("fee_international_usd"),
    /** Free text: Common App reports "Accepted", "U.S. only", or a refusal. */
    feeWaiver: text("fee_waiver"),
    feeSource: factSourceEnum("fee_source"),
    /**
     * The cycle or survey year the fee describes — "2026-27" from Common App,
     * "2023" from the federal survey.
     *
     * Not decoration. IPEDS collected the undergraduate application fee up to
     * 2023 and then dropped the field, so that figure can never get fresher,
     * and roughly a fifth of fees have changed since — nearly always downward,
     * as colleges drop them. A student must be able to see that the number
     * they are budgeting against is three years old.
     */
    feeYear: text("fee_year"),

    ...timestamps,
  },
  (t) => [unique("school_application_cycle").on(t.schoolId, t.cycle)],
);

export const schoolDeadlines = pgTable(
  "school_deadline",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    schoolId: text("school_id")
      .notNull()
      .references(() => schools.id, { onDelete: "cascade" }),
    cycle: text("cycle").notNull(),
    plan: applicationPlanEnum("plan").notNull(),
    dueDate: date("due_date").notNull(),
    ...timestamps,
  },
  (t) => [unique("school_deadline_unique").on(t.schoolId, t.cycle, t.plan)],
);

export const schoolCosts = pgTable(
  "school_cost",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    schoolId: text("school_id")
      .notNull()
      .references(() => schools.id, { onDelete: "cascade" }),
    year: text("year").notNull(), // "2026-27"
    stickerPrice: integer("sticker_price"),
    avgNetPrice: integer("avg_net_price"),
    netPriceUnder48k: integer("net_price_under_48k"),
    netPrice48to75k: integer("net_price_48_to_75k"),
    netPrice75to110k: integer("net_price_75_to_110k"),
    netPriceOver110k: integer("net_price_over_110k"),
    /*
      Published tuition and fees, by residency. Scorecard's net prices at a
      public school are for in-state students; the gap between these two is
      what an out-of-state student pays on top.
    */
    tuitionInState: integer("tuition_in_state"),
    tuitionOutOfState: integer("tuition_out_of_state"),
    percentNeedMet: doublePrecision("percent_need_met"),
    /** Editorial judgement, not a Scorecard field. Null when unknown. */
    meritAid: meritAidEnum("merit_aid"),
    ...timestamps,
  },
  (t) => [unique("school_cost_year").on(t.schoolId, t.year)],
);

/*
  Regional tuition exchanges a school takes part in — WUE, MSEP, the New
  England Regional Student Program, state reciprocity agreements. A student
  from one of `eligibleStates` pays reduced out-of-state tuition here.

  One row per school per program, written by scripts/import-tuition-programs.ts
  from lib/data/reciprocity.json; the program itself (its name, its terms,
  how to ask for it) lives in that file.
*/
export const schoolTuitionPrograms = pgTable(
  "school_tuition_program",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    schoolId: text("school_id")
      .notNull()
      .references(() => schools.id, { onDelete: "cascade" }),
    program: text("program").notNull(), // "wue", "msep", …
    eligibleStates: text("eligible_states").array().notNull(),
    /** This school's own limits: majors, GPA, a cap on awards. */
    restrictions: text("restrictions"),
    url: text("url"),
    ...timestamps,
  },
  (t) => [unique("school_tuition_program_school").on(t.schoolId, t.program)],
);

export const schoolOutcomes = pgTable(
  "school_outcome",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    schoolId: text("school_id")
      .notNull()
      .references(() => schools.id, { onDelete: "cascade" }),
    year: text("year").notNull(),
    /** Within six years (150% of normal time) — the federal headline figure. */
    gradRate: doublePrecision("grad_rate"),
    /** Within four years: what a family actually plans and pays for. */
    gradRate4yr: doublePrecision("grad_rate_4yr"),
    medianEarnings10yr: integer("median_earnings_10yr"),
    /** Editorial judgement, not a Scorecard field. Null when unknown. */
    alumniNetwork: alumniNetworkEnum("alumni_network"),
    ...timestamps,
  },
  (t) => [unique("school_outcome_year").on(t.schoolId, t.year)],
);

export const opportunities = pgTable("opportunity", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  org: text("org").notNull(),
  type: opportunityTypeEnum("type").notNull(),
  cost: opportunityCostEnum("cost").notNull(),
  selective: boolean("selective").notNull().default(false),
  location: text("location").notNull().default(""),
  interests: text("interests").array().notNull().default([]),
  description: text("description").notNull().default(""),
  // Preserves the deliberate free/low-cost-first ordering in the seed file.
  sortOrder: integer("sort_order").notNull().default(0),
  ...timestamps,
});

/* ————————————————————————————————————————
   Per-student data — the shared view
   ———————————————————————————————————————— */

export const listEntries = pgTable(
  "list_entry",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    studentId: text("student_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    schoolId: text("school_id")
      .notNull()
      .references(() => schools.id, { onDelete: "cascade" }),

    // chanceTier() derives a tier, but the list page lets students drag
    // between tier columns. Store the user's value plus a flag; compute on
    // read when not overridden.
    tier: chanceTierEnum("tier").notNull(),
    tierOverridden: boolean("tier_overridden").notNull().default(false),

    plan: applicationPlanEnum("plan"),
    status: listStatusEnum("status").notNull().default("considering"),
    outcome: listOutcomeEnum("outcome"),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => [
    unique("list_entry_unique").on(t.studentId, t.schoolId),
    index("list_entry_student_idx").on(t.studentId),
  ],
);

export const aidStatuses = pgTable("aid_status", {
  studentId: text("student_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  fafsa: fafsaStatusEnum("fafsa").notNull().default("not-started"),
  cssProfile: cssStatusEnum("css_profile").notNull().default("not-started"),
  ...timestamps,
});

export const aidOffers = pgTable(
  "aid_offer",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    studentId: text("student_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    schoolId: text("school_id")
      .notNull()
      .references(() => schools.id, { onDelete: "cascade" }),
    coa: integer("coa").notNull(),
    grants: integer("grants").notNull().default(0),
    loans: integer("loans").notNull().default(0),
    workStudy: integer("work_study").notNull().default(0),
    ...timestamps,
  },
  (t) => [unique("aid_offer_unique").on(t.studentId, t.schoolId)],
);

/** The /decide "gut feel" free text — previously component-local useState. */
export const decisionNotes = pgTable(
  "decision_note",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    studentId: text("student_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    schoolId: text("school_id")
      .notNull()
      .references(() => schools.id, { onDelete: "cascade" }),
    gutFeel: text("gut_feel").notNull().default(""),
    ...timestamps,
  },
  (t) => [unique("decision_note_unique").on(t.studentId, t.schoolId)],
);

/* ————————————————————————————————————————
   Per-student data — student-private by default
   ———————————————————————————————————————— */

export const essays = pgTable(
  "essay",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    studentId: text("student_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    promptText: text("prompt_text").notNull().default(""),
    schoolId: text("school_id").references(() => schools.id, { onDelete: "set null" }), // null = personal statement
    wordLimit: integer("word_limit").notNull().default(650),
    text: text("text").notNull().default(""),
    ...timestamps,
  },
  (t) => [index("essay_student_idx").on(t.studentId)],
);

export const essayVersions = pgTable(
  "essay_version",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    essayId: uuid("essay_id")
      .notNull()
      .references(() => essays.id, { onDelete: "cascade" }),
    text: text("text").notNull(),
    savedAt: timestamp("saved_at", { withTimezone: true }).notNull().defaultNow(),
    ...timestamps,
  },
  (t) => [index("essay_version_essay_idx").on(t.essayId)],
);

/**
 * Per-essay share grants. The apply-page copy says "unless you share it"
 * (per-draft) while the settings toggle reads as global; per-essay is the
 * stricter reading and satisfies both. sharedAt is the grant boundary —
 * versions saved before it stay hidden.
 */
export const essayShares = pgTable(
  "essay_share",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    essayId: uuid("essay_id")
      .notNull()
      .references(() => essays.id, { onDelete: "cascade" }),
    grantedToUserId: text("granted_to_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    sharedAt: timestamp("shared_at", { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [unique("essay_share_unique").on(t.essayId, t.grantedToUserId)],
);

export const recommenders = pgTable("recommender", {
  id: uuid("id").primaryKey().defaultRandom(),
  studentId: text("student_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  roleTitle: text("role_title").notNull().default(""),
  /** Needed to produce the invite block a real application asks for. */
  email: text("email").notNull().default(""),
  type: recommenderTypeEnum("type").notNull().default("teacher"),
  status: recommenderStatusEnum("status").notNull().default("invited"),
  ...timestamps,
});

export const recommenderSchools = pgTable(
  "recommender_school",
  {
    recommenderId: uuid("recommender_id")
      .notNull()
      .references(() => recommenders.id, { onDelete: "cascade" }),
    schoolId: text("school_id")
      .notNull()
      .references(() => schools.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.recommenderId, t.schoolId] })],
);

/** PII: legal name, DOB, address. Student-private. */
export const universalProfiles = pgTable("universal_profile", {
  studentId: text("student_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  legalName: text("legal_name").notNull().default(""),
  preferredName: text("preferred_name").notNull().default(""),
  dateOfBirth: text("date_of_birth").notNull().default(""),
  email: text("email").notNull().default(""),
  phone: text("phone").notNull().default(""),
  address: text("address").notNull().default(""),
  citizenship: text("citizenship").notNull().default(""),
  demographics: text("demographics").notNull().default(""),
  parentEducation: text("parent_education").notNull().default(""),
  highSchoolName: text("high_school_name").notNull().default(""),
  highSchoolCity: text("high_school_city").notNull().default(""),
  gradYear: text("grad_year").notNull().default(""),
  honors: text("honors").array().notNull().default([]),
  additionalInfo: text("additional_info").notNull().default(""),
  ...timestamps,
});

export const activities = pgTable("activity", {
  id: uuid("id").primaryKey().defaultRandom(),
  // Single home for activities. StudentProfile.activities is dropped — the
  // in-memory model had them in two places that never agreed.
  studentId: text("student_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  role: text("role").notNull().default(""),
  hoursPerWeek: integer("hours_per_week").notNull().default(0),
  weeksPerYear: integer("weeks_per_year").notNull().default(0),
  description: text("description").notNull().default(""),
  yearsInvolved: integer("years_involved").array().notNull().default([]),
  leadership: boolean("leadership").notNull().default(false),
  /*
    Where this sits when the student ranks their activities.

    Common App asks for up to ten in order of significance, and the only
    ordering this table had was createdAt — the order they happened to be
    typed in. Listing them that way in a packet asserts a ranking the student
    never made. Null means unranked, which is honest until they say.
  */
  position: integer("position"),
  ...timestamps,
});

export const coursePlanEntries = pgTable("course_plan_entry", {
  id: uuid("id").primaryKey().defaultRandom(),
  studentId: text("student_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  year: integer("year").notNull(), // 9–12
  subject: courseSubjectEnum("subject").notNull(),
  name: text("name").notNull(),
  level: courseLevelEnum("level").notNull().default("regular"),
  status: courseStatusEnum("status").notNull().default("planned"),
  grade: text("grade"),
  /**
   * The grading period, when it came from a transcript — "S1", "06/2022".
   *
   * Transcripts are per-term, so a year-long course is two rows with two
   * grades. Without this the two are indistinguishable on screen and read
   * as an import bug.
   */
  term: text("term"),
  /** Credits earned, as printed. GPA is credit-weighted where schools say so. */
  credits: doublePrecision("credits"),
  ...timestamps,
});

export const weeklyCheckIns = pgTable("weekly_check_in", {
  id: uuid("id").primaryKey().defaultRandom(),
  studentId: text("student_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  weekOf: date("week_of").notNull(),
  mode: gradeModeEnum("mode").notNull(),
  dismissed: boolean("dismissed").notNull().default(false),
  ...timestamps,
});

/** Real ids — the in-memory version mutated actions by array index. */
export const checkInActions = pgTable("check_in_action", {
  id: uuid("id").primaryKey().defaultRandom(),
  checkInId: uuid("check_in_id")
    .notNull()
    .references(() => weeklyCheckIns.id, { onDelete: "cascade" }),
  text: text("text").notNull(),
  done: boolean("done").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
  ...timestamps,
});

/* ————————————————————————————————————————
   Counselor + interviews — never parent-visible.

   Neither existed in lib/types.ts; both were component-local useState that
   vanished on navigation.
   ———————————————————————————————————————— */

export const counselorThreads = pgTable(
  "counselor_thread",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    studentId: text("student_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull().default("New conversation"),
    // Set when the conversation started from a school's page: every turn in
    // it is about that school, after a reload and on any device.
    schoolId: text("school_id").references(() => schools.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [index("counselor_thread_student_idx").on(t.studentId)],
);

export const counselorMessages = pgTable(
  "counselor_message",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    threadId: uuid("thread_id")
      .notNull()
      .references(() => counselorThreads.id, { onDelete: "cascade" }),
    author: messageAuthorEnum("author").notNull(),
    text: text("text").notNull(),
    // The CounselorCard discriminated union from lib/counselor.ts.
    cards: jsonb("cards"),
    ...timestamps,
  },
  (t) => [index("counselor_message_thread_idx").on(t.threadId)],
);

export const interviewSessions = pgTable("interview_session", {
  id: uuid("id").primaryKey().defaultRandom(),
  studentId: text("student_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  schoolId: text("school_id").references(() => schools.id, { onDelete: "set null" }),
  ...timestamps,
});

export const interviewTurns = pgTable("interview_turn", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionId: uuid("session_id")
    .notNull()
    .references(() => interviewSessions.id, { onDelete: "cascade" }),
  question: text("question").notNull(),
  answer: text("answer").notNull(),
  strengths: text("strengths").array().notNull().default([]),
  toWorkOn: text("to_work_on").array().notNull().default([]),
  followUp: text("follow_up").notNull().default(""),
  // Structured, so the next question is no longer regex-scraped out of prose
  // the way app/(app)/interviews/page.tsx:61 does today.
  nextQuestion: text("next_question"),
  sortOrder: integer("sort_order").notNull().default(0),
  ...timestamps,
});

/* ————————————————————————————————————————
   Preferences + view history
   ———————————————————————————————————————— */

export const userPreferences = pgTable("user_preference", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  notifyDeadlines: boolean("notify_deadlines").notNull().default(true),
  notifyCheckIn: boolean("notify_check_in").notNull().default(true),
  notifyNudges: boolean("notify_nudges").notNull().default(false),
  // Convenience flag; the authoritative grants are rows in essay_shares.
  shareEssaysByDefault: boolean("share_essays_by_default").notNull().default(false),
  ...timestamps,
});

export const recentlyViewed = pgTable(
  "recently_viewed",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    schoolId: text("school_id")
      .notNull()
      .references(() => schools.id, { onDelete: "cascade" }),
    viewedAt: timestamp("viewed_at", { withTimezone: true }).notNull().defaultNow(),
    ...timestamps,
  },
  (t) => [unique("recently_viewed_unique").on(t.userId, t.schoolId)],
);

/**
 * Cache for whyThisSchool.
 *
 * That call fired on every school-detail page view with no caching, so a
 * student browsing 40 schools triggered 40 completions. The explanation is
 * profile-specific, so profileHash invalidates it when the inputs it depends
 * on change rather than on a timer.
 */
export const schoolExplanations = pgTable(
  "school_explanation",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    studentId: text("student_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    schoolId: text("school_id")
      .notNull()
      .references(() => schools.id, { onDelete: "cascade" }),
    text: text("text").notNull(),
    profileHash: text("profile_hash").notNull(),
    ...timestamps,
  },
  (t) => [unique("school_explanation_unique").on(t.studentId, t.schoolId)],
);

/* ————————————————————————————————————————
   AI usage.

   Every Claude call records what it cost. lib/counselor/claude.ts already
   receives usage on each response and discarded it. This is what makes AI
   spend visible per user and per feature, and it's the data a per-user rate
   limit would need.
   ———————————————————————————————————————— */

export const aiFeatureEnum = pgEnum("ai_feature", [
  "thread_title",
  "chat",
  "greet",
  "essay_feedback",
  "interview",
  "why_school",
  "throughline",
  "summarize",
  // Text-to-speech. Priced per audio output token by a different provider
  // (Gemini), which is why lib/costs.ts keeps a separate rate for it.
  "speech",
  // Reading an uploaded transcript into course rows. Input-heavy — a PDF
  // costs far more in input tokens than any chat turn — so it gets its own
  // line rather than hiding inside another feature's total.
  "transcript",
  "memory",
]);

export const aiUsage = pgTable(
  "ai_usage",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    feature: aiFeatureEnum("feature").notNull(),
    model: text("model").notNull(),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    cacheReadTokens: integer("cache_read_tokens").notNull().default(0),
    cacheCreationTokens: integer("cache_creation_tokens").notNull().default(0),
    /** Tenths of a cent, so sub-cent calls don't round to zero. */
    costMillicents: integer("cost_millicents").notNull().default(0),
    ...timestamps,
  },
  (t) => [
    index("ai_usage_user_idx").on(t.userId),
    index("ai_usage_created_idx").on(t.createdAt),
  ],
);

/* ————————————————————————————————————————
   Legal consent.

   Append-only. A row is the evidence that a specific person accepted a
   specific version of a specific document at a specific moment, from a
   specific address — which is the part that matters if the agreement is
   ever questioned. Nothing updates or deletes a row here; re-accepting a
   new version writes a new one, so the history stays intact.

   Deliberately not a boolean on `user`: a flag records that someone
   agreed to something, but not to *what*, which is the only version of
   the fact worth having.
   ———————————————————————————————————————— */
export const legalConsents = pgTable(
  "legal_consent",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    document: legalDocumentEnum("document").notNull(),
    /** The version string from lib/legal.ts, e.g. "2026-08-09". */
    version: text("version").notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }).notNull().defaultNow(),
    /** Evidence of the acceptance. Null when a proxy hides the origin. */
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    ...timestamps,
  },
  (t) => [
    index("legal_consent_user_idx").on(t.userId),
    // One acceptance per person per document version — re-accepting the
    // same version is idempotent rather than a duplicate record.
    unique("legal_consent_unique").on(t.userId, t.document, t.version),
  ],
);

/* ————————————————————————————————————————
   Admin settings.

   A single row (id = "singleton") holding operator-tunable values that
   would otherwise be constants requiring a deploy to change — the cost
   budget and its alert thresholds.

   Rates in lib/costs.ts stay in code because they are facts about what
   vendors charge. What lives here is policy: what *we* consider too much.
   ———————————————————————————————————————— */
export const adminSettings = pgTable("admin_settings", {
  id: text("id").primaryKey().default("singleton"),
  /** Monthly all-in budget in whole US dollars. */
  monthlyBudgetUsd: integer("monthly_budget_usd").notNull().default(25),
  /** Percentages of budget that trigger an alert, e.g. [80, 100]. */
  alertThresholds: integer("alert_thresholds").array().notNull().default([80, 100]),
  /** Blank means every admin. */
  alertEmail: text("alert_email").notNull().default(""),
  alertsEnabled: boolean("alerts_enabled").notNull().default(true),
  /** Set when an alert fires, so the same threshold isn't re-sent all month. */
  lastAlertAt: timestamp("last_alert_at", { withTimezone: true }),
  lastAlertThreshold: integer("last_alert_threshold"),
  ...timestamps,
});

/* ————————————————————————————————————————
   Feedback.

   In-product reports from users. Deliberately its own table rather than a
   counselor thread: this is operational, an admin reads it by design, and
   conflating it with the private counselor conversation would put admin
   eyes on the wrong side of the privacy boundary.
   ———————————————————————————————————————— */
export const feedbackStatusEnum = pgEnum("feedback_status", ["open", "resolved"]);

export const feedback = pgTable(
  "feedback",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Kept on user delete so a report doesn't vanish mid-investigation;
    // the author reference is nulled instead.
    userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
    /** Denormalized so a resolved report still says who sent it. */
    email: text("email").notNull().default(""),
    message: text("message").notNull(),
    /** Where they were when they sent it. */
    path: text("path").notNull().default(""),
    status: feedbackStatusEnum("status").notNull().default("open"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index("feedback_status_idx").on(t.status),
    index("feedback_created_idx").on(t.createdAt),
  ],
);


/* ————————————————————————————————————————
   School logos.

   Stored as bytes, not as a URL. A remote logo URL is a link that rots and
   a request the student's browser makes to a third party on every card —
   which would tell that third party exactly which schools a teenager is
   looking at. Fetching once at import time and serving from our own domain
   fixes both: nothing breaks when an upstream service changes, and no one
   outside Lumni learns what anybody browsed.

   Small enough to sit in Postgres rather than object storage: a few KB per
   school, so all ~2,000 institutions come to roughly 20 MB, which the
   existing backups already cover.
   ———————————————————————————————————————— */

const bytea = customType<{ data: Buffer; default: false }>({
  dataType: () => "bytea",
});

export const schoolLogos = pgTable("school_logo", {
  schoolId: text("school_id")
    .primaryKey()
    .references(() => schools.id, { onDelete: "cascade" }),
  bytes: bytea("bytes").notNull(),
  contentType: text("content_type").notNull().default("image/png"),
  /** Where it came from, so a bad fetch can be traced and redone. */
  sourceUrl: text("source_url").notNull().default(""),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
  ...timestamps,
});

/* ————————————————————————————————————————
   Uploaded transcripts.

   The file itself lives here, in Postgres, for the same reason the logos do
   and one more: a transcript is the single most sensitive document a student
   will hand this product. Keeping the bytes inside the database the rest of
   their record already lives in means one place to secure, one backup, and
   one `ON DELETE CASCADE` when an account goes away — rather than an object
   store with its own access rules and its own orphans. At a few hundred KB
   per file and a handful of files per student, the size argument for object
   storage doesn't arrive for a long time.

   `extraction` caches what the model read out of the file. Parsing a PDF is
   an expensive call, and without this every page load that wants to show
   "we found 24 courses" would either re-bill it or lose it.
   ———————————————————————————————————————— */

export const transcripts = pgTable(
  "transcript",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    studentId: text("student_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** What the student called it, shown in the list and on download. */
    filename: text("filename").notNull(),
    contentType: text("content_type").notNull(),
    sizeBytes: integer("size_bytes").notNull().default(0),
    bytes: bytea("bytes").notNull(),
    /**
     * Courses the model read out of this file, in the shape of
     * lib/types.ts `ExtractedCourse[]`. Null until it has been read.
     */
    extraction: jsonb("extraction"),
    /**
     * The GPA the document prints for itself.
     *
     * Kept separate from anything we compute. A school's own cumulative GPA
     * is the number that goes on applications, and it is not reproducible
     * from a course list — it excludes pass/fail work, weights by credit,
     * and follows the school's own scale. Recomputing and showing a
     * different number is how a student ends up telling a college 3.58 when
     * their counselor reports 3.01.
     */
    reportedGpa: doublePrecision("reported_gpa"),
    reportedGpaWeighted: doublePrecision("reported_gpa_weighted"),
    reportedCredits: doublePrecision("reported_credits"),
    extractedAt: timestamp("extracted_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index("transcript_student_idx").on(t.studentId)],
);

/* ————————————— Profile photo ————————————— */

/**
 * The photo a person chose for their account, one per user.
 *
 * Stored here rather than in Better Auth's `user.image`, which is a URL —
 * that would mean a public bucket, and most of these are minors' faces.
 * The bytes are only ever served to their owner (/api/v1/me/avatar). The
 * app shrinks the image before upload, so a row is tens of KB.
 */
export const userAvatars = pgTable("user_avatar", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  contentType: text("content_type").notNull(),
  bytes: bytea("bytes").notNull(),
  ...timestamps,
});

/* ————————————— Counselor memory ————————————— */

/**
 * What the student has told the counselor about themselves, kept across
 * conversations.
 *
 * Each row is one durable fact in plain words ("Wants to stay within a
 * day's drive of home"), filed under a topic from lib/memory.ts. Most are
 * pulled from chat turns by a small model after the reply is sent; the
 * student can also add, correct or delete them on the You screen, which is
 * the point — it's their record of what the counselor believes, and the
 * counselor reads it on every answer.
 *
 * Student-private ("counselorMemory" in lib/auth/policy.ts): a parent never
 * reads it, the same as the threads it came from.
 */
export const counselorMemories = pgTable(
  "counselor_memory",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    studentId: text("student_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    category: text("category").notNull(),
    fact: text("fact").notNull(),
    /** "chat" when the counselor picked it up; "student" when typed in. */
    source: text("source").notNull().default("chat"),
    /** The conversation it came from, while that conversation exists. */
    threadId: uuid("thread_id").references(() => counselorThreads.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [index("counselor_memory_student_idx").on(t.studentId)],
);

/* ————————————————————————————————————————
   Pro: who has it, from where, and what changed.

   `entitlement` is the single source of truth for Pro (docs/plans/
   lumni-pro.md). A row says "this account has Pro from `starts_at` until
   `ends_at` (null: no end), because of `source`". Rows are never deleted:
   revoking sets `revoked_at`, so the record of what someone had survives.

   The holder can be a student or a parent — a parent can buy before their
   student has an account. Pro is shared across an active parent link in
   lib/entitlements.ts, not copied here, so unlinking ends the sharing
   without touching anyone's rows.

   `account_event` is the append-only history behind the admin portal:
   who changed what about an account, when, and why. It's the first audit
   log the portal has had.
   ———————————————————————————————————————— */

export const entitlementSourceEnum = pgEnum("entitlement_source", [
  "app_store",
  "admin",
  "free_access",
  "school",
]);

export const entitlements = pgTable(
  "entitlement",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    source: entitlementSourceEnum("source").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull().defaultNow(),
    /** Null: no end date. */
    endsAt: timestamp("ends_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    /** An App Store introductory offer that hasn't converted yet. */
    inTrial: boolean("in_trial").notNull().default(false),
    /** App Store: the product bought, and the id that ties renewals together. */
    productId: text("product_id"),
    originalTransactionId: text("original_transaction_id"),
    /** Who granted it, for admin and free-access grants. */
    grantedBy: text("granted_by").references(() => users.id, { onDelete: "set null" }),
    note: text("note"),
    ...timestamps,
  },
  (t) => [
    index("entitlement_user_idx").on(t.userId),
    unique("entitlement_app_store_txn").on(t.originalTransactionId),
  ],
);

export const accountEvents = pgTable(
  "account_event",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** The account the event is about. */
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Who did it: an admin's id, or null for the system or Apple. */
    actorId: text("actor_id").references(() => users.id, { onDelete: "set null" }),
    /** "admin" | "system" | "apple" | "user" */
    actorKind: text("actor_kind").notNull(),
    /** e.g. "pro.granted", "pro.revoked". */
    action: text("action").notNull(),
    reason: text("reason"),
    /** What changed: the entitlement's id, source, dates. */
    detail: jsonb("detail"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("account_event_user_idx").on(t.userId, t.createdAt)],
);

/* ————————————————————————————————————————
   Link codes: how a student and a parent link from the app.

   Either side makes one (Settings › Link an account) and sends it however
   they like; the other side enters it. A code is short enough to read
   aloud, works once, for the opposite role only, and for seven days. The
   link it makes is an ordinary parent_student_link — and since Pro is shared
   across that link, a purchase by either side covers the pair.
   ———————————————————————————————————————— */

export const linkCodes = pgTable(
  "link_code",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** As shown: "7Q2-K9M". Stored without the dash. */
    code: text("code").notNull().unique(),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    usedBy: text("used_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("link_code_creator_idx").on(t.createdBy)],
);

/* ————————————————————————————————————————
   The id an account's App Store purchases carry.

   The app passes it as StoreKit's appAccountToken on every purchase, and
   Apple repeats it in every transaction and server notification after —
   so a renewal or refund that reaches the server before the app does still
   lands on the right account. Random, not derived from the user id, so a
   transaction seen outside Lumni says nothing about who bought it.
   ———————————————————————————————————————— */

export const appStoreAccounts = pgTable("app_store_account", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  appAccountToken: uuid("app_account_token").notNull().unique().defaultRandom(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ————————————————————————————————————————
   Free access: "Can't afford Pro?" (docs/plans/lumni-pro.md, step 4).

   A student — or a parent, for their family — asks in a sentence or two;
   the request waits in the admin portal; approving grants 12 months of Pro
   with source "free_access". Judgment, not verification, until there's
   volume enough to need more.
   ———————————————————————————————————————— */

export const requestStatusEnum = pgEnum("request_status", ["pending", "approved", "declined"]);

export const freeAccessRequests = pgTable(
  "free_access_request",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    message: text("message").notNull(),
    schoolName: text("school_name"),
    status: requestStatusEnum("status").notNull().default("pending"),
    decidedBy: text("decided_by").references(() => users.id, { onDelete: "set null" }),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    /** The admin's note on the decision; shown to the requester when declined. */
    decisionNote: text("decision_note"),
    ...timestamps,
  },
  (t) => [index("free_access_user_idx").on(t.userId), index("free_access_status_idx").on(t.status)],
);

/* ————————————————————————————————————————
   Schools (docs/plans/lumni-pro.md, step 5).

   A school or nonprofit buys seats — Pro for its students — invoiced
   directly (App Store guideline 3.1.3(c), Enterprise Services). Leads come
   from "For schools" forms on the marketing site and in the app. A license
   has one code; each student who enters it uses a seat and gets Pro until
   the license ends.
   ———————————————————————————————————————— */

export const leadStatusEnum = pgEnum("lead_status", ["new", "contacted", "piloting", "customer", "closed"]);

export const schoolLeads = pgTable(
  "school_lead",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    schoolName: text("school_name").notNull(),
    contactName: text("contact_name").notNull(),
    /** Their role: counselor, principal, nonprofit staff… */
    role: text("role"),
    email: text("email").notNull(),
    /** Roughly how many students. */
    students: integer("students"),
    message: text("message"),
    /** "site" (the marketing site) or "app". */
    source: text("source").notNull(),
    /** Set when it came from a signed-in account in the app. */
    userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
    status: leadStatusEnum("status").notNull().default("new"),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => [index("school_lead_status_idx").on(t.status)],
);

export const schoolLicenses = pgTable(
  "school_license",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgName: text("org_name").notNull(),
    contactEmail: text("contact_email"),
    seats: integer("seats").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull().defaultNow(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    /** As shown: "LINCOLN-7Q2K". Stored upper-case, dash kept. */
    code: text("code").notNull().unique(),
    /** Per seat per year, in cents; null for a free pilot. */
    priceCents: integer("price_cents"),
    /** "pilot", "invoiced", "paid", "overdue". */
    invoiceStatus: text("invoice_status").notNull().default("pilot"),
    leadId: uuid("lead_id").references(() => schoolLeads.id, { onDelete: "set null" }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    notes: text("notes"),
    createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
);

export const seatRedemptions = pgTable(
  "seat_redemption",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    licenseId: uuid("license_id")
      .notNull()
      .references(() => schoolLicenses.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    entitlementId: uuid("entitlement_id").references(() => entitlements.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("seat_redemption_once").on(t.licenseId, t.userId), index("seat_redemption_license_idx").on(t.licenseId)],
);
