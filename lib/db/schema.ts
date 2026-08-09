/* ————————————————————————————————————————
   Northstar database schema.

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
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

/* ————————————— Enums ————————————— */

export const roleEnum = pgEnum("role", ["student", "parent"]);
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
  selfReportedGpaWeighted: real("self_reported_gpa_weighted"),
  selfReportedGpaUnweighted: real("self_reported_gpa_unweighted"),

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

  // Academics
  topMajors: text("top_majors").array().notNull().default([]),
  studentFacultyRatio: text("student_faculty_ratio").notNull().default(""),
  notablePrograms: text("notable_programs").array().notNull().default([]),
  researchOpportunities: boolean("research_opportunities").notNull().default(false),
  coOp: boolean("co_op").notNull().default(false),

  // Life
  vibe: text("vibe").notNull().default(""),
  greekLifePresence: greekPresenceEnum("greek_life_presence").notNull().default("low"),
  d1Athletics: boolean("d1_athletics").notNull().default(false),
  housingGuaranteed: integer("housing_guaranteed").notNull().default(0),
  weather: text("weather").notNull().default(""),
  commonComplaints: text("common_complaints").notNull().default(""),
  religiousAffiliation: text("religious_affiliation"),

  // City
  costOfLiving: costOfLivingEnum("cost_of_living").notNull().default("moderate"),
  transit: text("transit").notNull().default(""),
  airportAccess: text("airport_access").notNull().default(""),
  internshipMarket: text("internship_market").notNull().default(""),
  thingsToDo: text("things_to_do").notNull().default(""),

  // Gates counselorPicks() in lib/match.ts — only schools with this are eligible.
  underratedFor: text("underrated_for"),

  ...timestamps,
});

export const schoolAdmissions = pgTable(
  "school_admissions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    schoolId: text("school_id")
      .notNull()
      .references(() => schools.id, { onDelete: "cascade" }),
    cycle: text("cycle").notNull(), // "2026-27"
    acceptanceRate: real("acceptance_rate").notNull(),
    gpaMid50Low: real("gpa_mid50_low").notNull(),
    gpaMid50High: real("gpa_mid50_high").notNull(),
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
    stickerPrice: integer("sticker_price").notNull(),
    avgNetPrice: integer("avg_net_price").notNull(),
    netPriceUnder48k: integer("net_price_under_48k").notNull(),
    netPrice48to75k: integer("net_price_48_to_75k").notNull(),
    netPrice75to110k: integer("net_price_75_to_110k").notNull(),
    netPriceOver110k: integer("net_price_over_110k").notNull(),
    percentNeedMet: real("percent_need_met").notNull(),
    meritAid: meritAidEnum("merit_aid").notNull(),
    ...timestamps,
  },
  (t) => [unique("school_cost_year").on(t.schoolId, t.year)],
);

export const schoolOutcomes = pgTable(
  "school_outcome",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    schoolId: text("school_id")
      .notNull()
      .references(() => schools.id, { onDelete: "cascade" }),
    year: text("year").notNull(),
    gradRate: real("grad_rate").notNull(),
    medianEarnings10yr: integer("median_earnings_10yr").notNull(),
    alumniNetwork: alumniNetworkEnum("alumni_network").notNull(),
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
  "chat",
  "greet",
  "essay_feedback",
  "interview",
  "why_school",
  "throughline",
  "summarize",
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
