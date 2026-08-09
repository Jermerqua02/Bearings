CREATE TYPE "public"."alumni_network" AS ENUM('regional', 'national', 'global');--> statement-breakpoint
CREATE TYPE "public"."application_plan" AS ENUM('ED', 'ED2', 'EA', 'REA', 'RD', 'rolling');--> statement-breakpoint
CREATE TYPE "public"."campus_setting" AS ENUM('urban', 'suburban', 'college-town', 'rural');--> statement-breakpoint
CREATE TYPE "public"."chance_tier" AS ENUM('reach', 'target', 'likely');--> statement-breakpoint
CREATE TYPE "public"."cost_of_living" AS ENUM('low', 'moderate', 'high', 'very-high');--> statement-breakpoint
CREATE TYPE "public"."course_level" AS ENUM('regular', 'honors', 'ap', 'ib');--> statement-breakpoint
CREATE TYPE "public"."course_status" AS ENUM('completed', 'in-progress', 'planned');--> statement-breakpoint
CREATE TYPE "public"."course_subject" AS ENUM('English', 'Math', 'Science', 'Social Studies', 'Language', 'Arts', 'Elective');--> statement-breakpoint
CREATE TYPE "public"."css_status" AS ENUM('not-needed', 'not-started', 'in-progress', 'submitted');--> statement-breakpoint
CREATE TYPE "public"."fafsa_status" AS ENUM('not-started', 'in-progress', 'submitted');--> statement-breakpoint
CREATE TYPE "public"."grade_mode" AS ENUM('build', 'explore', 'apply', 'decide');--> statement-breakpoint
CREATE TYPE "public"."greek_presence" AS ENUM('none', 'low', 'moderate', 'high');--> statement-breakpoint
CREATE TYPE "public"."involvement_level" AS ENUM('light-touch', 'regular-check-ins', 'hands-on');--> statement-breakpoint
CREATE TYPE "public"."link_status" AS ENUM('invited', 'active', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."list_outcome" AS ENUM('accepted', 'waitlisted', 'denied', 'deferred');--> statement-breakpoint
CREATE TYPE "public"."list_status" AS ENUM('considering', 'applying', 'in-progress', 'submitted', 'materials-received', 'decision');--> statement-breakpoint
CREATE TYPE "public"."merit_aid" AS ENUM('none', 'limited', 'generous');--> statement-breakpoint
CREATE TYPE "public"."message_author" AS ENUM('user', 'counselor');--> statement-breakpoint
CREATE TYPE "public"."opportunity_cost" AS ENUM('free', 'low-cost', 'paid', 'stipend');--> statement-breakpoint
CREATE TYPE "public"."opportunity_type" AS ENUM('program', 'internship', 'research', 'job', 'volunteering');--> statement-breakpoint
CREATE TYPE "public"."recommender_status" AS ENUM('invited', 'in-progress', 'submitted');--> statement-breakpoint
CREATE TYPE "public"."recommender_type" AS ENUM('teacher', 'counselor', 'other');--> statement-breakpoint
CREATE TYPE "public"."region" AS ENUM('northeast', 'mid-atlantic', 'south', 'midwest', 'southwest', 'west', 'northwest');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('student', 'parent');--> statement-breakpoint
CREATE TYPE "public"."school_size" AS ENUM('small', 'medium', 'large');--> statement-breakpoint
CREATE TYPE "public"."school_type" AS ENUM('private', 'public-flagship', 'public', 'lac', 'tech', 'hbcu');--> statement-breakpoint
CREATE TYPE "public"."test_policy" AS ENUM('required', 'optional', 'blind');--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "activity" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" text NOT NULL,
	"name" text NOT NULL,
	"role" text DEFAULT '' NOT NULL,
	"hours_per_week" integer DEFAULT 0 NOT NULL,
	"weeks_per_year" integer DEFAULT 0 NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"years_involved" integer[] DEFAULT '{}' NOT NULL,
	"leadership" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "aid_offer" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" text NOT NULL,
	"school_id" text NOT NULL,
	"coa" integer NOT NULL,
	"grants" integer DEFAULT 0 NOT NULL,
	"loans" integer DEFAULT 0 NOT NULL,
	"work_study" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "aid_offer_unique" UNIQUE("student_id","school_id")
);
--> statement-breakpoint
CREATE TABLE "aid_status" (
	"student_id" text PRIMARY KEY NOT NULL,
	"fafsa" "fafsa_status" DEFAULT 'not-started' NOT NULL,
	"css_profile" "css_status" DEFAULT 'not-started' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "check_in_action" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"check_in_id" uuid NOT NULL,
	"text" text NOT NULL,
	"done" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "counselor_message" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"thread_id" uuid NOT NULL,
	"author" "message_author" NOT NULL,
	"text" text NOT NULL,
	"cards" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "counselor_thread" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" text NOT NULL,
	"title" text DEFAULT 'New conversation' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "course_plan_entry" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" text NOT NULL,
	"year" integer NOT NULL,
	"subject" "course_subject" NOT NULL,
	"name" text NOT NULL,
	"level" "course_level" DEFAULT 'regular' NOT NULL,
	"status" "course_status" DEFAULT 'planned' NOT NULL,
	"grade" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "decision_note" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" text NOT NULL,
	"school_id" text NOT NULL,
	"gut_feel" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "decision_note_unique" UNIQUE("student_id","school_id")
);
--> statement-breakpoint
CREATE TABLE "essay_share" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"essay_id" uuid NOT NULL,
	"granted_to_user_id" text NOT NULL,
	"shared_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "essay_share_unique" UNIQUE("essay_id","granted_to_user_id")
);
--> statement-breakpoint
CREATE TABLE "essay_version" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"essay_id" uuid NOT NULL,
	"text" text NOT NULL,
	"saved_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "essay" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" text NOT NULL,
	"title" text NOT NULL,
	"prompt_text" text DEFAULT '' NOT NULL,
	"school_id" text,
	"word_limit" integer DEFAULT 650 NOT NULL,
	"text" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "interview_session" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" text NOT NULL,
	"school_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "interview_turn" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"question" text NOT NULL,
	"answer" text NOT NULL,
	"strengths" text[] DEFAULT '{}' NOT NULL,
	"to_work_on" text[] DEFAULT '{}' NOT NULL,
	"follow_up" text DEFAULT '' NOT NULL,
	"next_question" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "list_entry" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" text NOT NULL,
	"school_id" text NOT NULL,
	"tier" "chance_tier" NOT NULL,
	"tier_overridden" boolean DEFAULT false NOT NULL,
	"plan" "application_plan",
	"status" "list_status" DEFAULT 'considering' NOT NULL,
	"outcome" "list_outcome",
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "list_entry_unique" UNIQUE("student_id","school_id")
);
--> statement-breakpoint
CREATE TABLE "opportunity" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"org" text NOT NULL,
	"type" "opportunity_type" NOT NULL,
	"cost" "opportunity_cost" NOT NULL,
	"selective" boolean DEFAULT false NOT NULL,
	"location" text DEFAULT '' NOT NULL,
	"interests" text[] DEFAULT '{}' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "parent_profile" (
	"user_id" text PRIMARY KEY NOT NULL,
	"first_name" text NOT NULL,
	"relationship" text NOT NULL,
	"student_grade" integer NOT NULL,
	"budget_per_year" integer,
	"priorities" text[] DEFAULT '{}' NOT NULL,
	"biggest_worry" text DEFAULT '' NOT NULL,
	"involvement_level" "involvement_level" DEFAULT 'regular-check-ins' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "parent_student_link" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" text NOT NULL,
	"parent_id" text,
	"parent_email" text NOT NULL,
	"status" "link_status" DEFAULT 'invited' NOT NULL,
	"invite_token" text NOT NULL,
	"invited_at" timestamp with time zone DEFAULT now() NOT NULL,
	"accepted_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "parent_student_link_invite_token_unique" UNIQUE("invite_token"),
	CONSTRAINT "psl_unique_pair" UNIQUE("student_id","parent_email")
);
--> statement-breakpoint
CREATE TABLE "recently_viewed" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"school_id" text NOT NULL,
	"viewed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recently_viewed_unique" UNIQUE("user_id","school_id")
);
--> statement-breakpoint
CREATE TABLE "recommender_school" (
	"recommender_id" uuid NOT NULL,
	"school_id" text NOT NULL,
	CONSTRAINT "recommender_school_recommender_id_school_id_pk" PRIMARY KEY("recommender_id","school_id")
);
--> statement-breakpoint
CREATE TABLE "recommender" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" text NOT NULL,
	"name" text NOT NULL,
	"role_title" text DEFAULT '' NOT NULL,
	"type" "recommender_type" DEFAULT 'teacher' NOT NULL,
	"status" "recommender_status" DEFAULT 'invited' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "school_admissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" text NOT NULL,
	"cycle" text NOT NULL,
	"acceptance_rate" real NOT NULL,
	"gpa_mid50_low" real NOT NULL,
	"gpa_mid50_high" real NOT NULL,
	"sat_mid50_low" integer,
	"sat_mid50_high" integer,
	"act_mid50_low" integer,
	"act_mid50_high" integer,
	"test_policy" "test_policy" NOT NULL,
	"plans_offered" "application_plan"[] DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "school_admissions_cycle" UNIQUE("school_id","cycle")
);
--> statement-breakpoint
CREATE TABLE "school_cost" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" text NOT NULL,
	"year" text NOT NULL,
	"sticker_price" integer NOT NULL,
	"avg_net_price" integer NOT NULL,
	"net_price_under_48k" integer NOT NULL,
	"net_price_48_to_75k" integer NOT NULL,
	"net_price_75_to_110k" integer NOT NULL,
	"net_price_over_110k" integer NOT NULL,
	"percent_need_met" real NOT NULL,
	"merit_aid" "merit_aid" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "school_cost_year" UNIQUE("school_id","year")
);
--> statement-breakpoint
CREATE TABLE "school_deadline" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" text NOT NULL,
	"cycle" text NOT NULL,
	"plan" "application_plan" NOT NULL,
	"due_date" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "school_deadline_unique" UNIQUE("school_id","cycle","plan")
);
--> statement-breakpoint
CREATE TABLE "school_outcome" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" text NOT NULL,
	"year" text NOT NULL,
	"grad_rate" real NOT NULL,
	"median_earnings_10yr" integer NOT NULL,
	"alumni_network" "alumni_network" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "school_outcome_year" UNIQUE("school_id","year")
);
--> statement-breakpoint
CREATE TABLE "school" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"short_name" text NOT NULL,
	"city" text NOT NULL,
	"state" text NOT NULL,
	"region" "region" NOT NULL,
	"type" "school_type" NOT NULL,
	"setting" "campus_setting" NOT NULL,
	"size" "school_size" NOT NULL,
	"undergrad_enrollment" integer NOT NULL,
	"photo_query" text DEFAULT '' NOT NULL,
	"top_majors" text[] DEFAULT '{}' NOT NULL,
	"student_faculty_ratio" text DEFAULT '' NOT NULL,
	"notable_programs" text[] DEFAULT '{}' NOT NULL,
	"research_opportunities" boolean DEFAULT false NOT NULL,
	"co_op" boolean DEFAULT false NOT NULL,
	"vibe" text DEFAULT '' NOT NULL,
	"greek_life_presence" "greek_presence" DEFAULT 'low' NOT NULL,
	"d1_athletics" boolean DEFAULT false NOT NULL,
	"housing_guaranteed" integer DEFAULT 0 NOT NULL,
	"weather" text DEFAULT '' NOT NULL,
	"common_complaints" text DEFAULT '' NOT NULL,
	"religious_affiliation" text,
	"cost_of_living" "cost_of_living" DEFAULT 'moderate' NOT NULL,
	"transit" text DEFAULT '' NOT NULL,
	"airport_access" text DEFAULT '' NOT NULL,
	"internship_market" text DEFAULT '' NOT NULL,
	"things_to_do" text DEFAULT '' NOT NULL,
	"underrated_for" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "student_profile" (
	"user_id" text PRIMARY KEY NOT NULL,
	"first_name" text NOT NULL,
	"grade_level" integer NOT NULL,
	"self_reported_gpa_weighted" real,
	"self_reported_gpa_unweighted" real,
	"ap_count" integer DEFAULT 0 NOT NULL,
	"ib_count" integer DEFAULT 0 NOT NULL,
	"honors_count" integer DEFAULT 0 NOT NULL,
	"sat" integer,
	"act" integer,
	"planning_to_test" boolean DEFAULT false NOT NULL,
	"intended_majors" text[] DEFAULT '{}' NOT NULL,
	"undecided" boolean DEFAULT false NOT NULL,
	"regions" "region"[] DEFAULT '{}' NOT NULL,
	"max_distance_miles" integer,
	"campus_sizes" "school_size"[] DEFAULT '{}' NOT NULL,
	"campus_settings" "campus_setting"[] DEFAULT '{}' NOT NULL,
	"budget_max_per_year" integer,
	"will_file_fafsa" boolean DEFAULT false NOT NULL,
	"values" text[] DEFAULT '{}' NOT NULL,
	"throughline_paragraph" text,
	"throughline_evidence" text[],
	"throughline_still_forming" boolean,
	"throughline_generated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "universal_profile" (
	"student_id" text PRIMARY KEY NOT NULL,
	"legal_name" text DEFAULT '' NOT NULL,
	"preferred_name" text DEFAULT '' NOT NULL,
	"date_of_birth" text DEFAULT '' NOT NULL,
	"email" text DEFAULT '' NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"address" text DEFAULT '' NOT NULL,
	"citizenship" text DEFAULT '' NOT NULL,
	"demographics" text DEFAULT '' NOT NULL,
	"parent_education" text DEFAULT '' NOT NULL,
	"high_school_name" text DEFAULT '' NOT NULL,
	"high_school_city" text DEFAULT '' NOT NULL,
	"grad_year" text DEFAULT '' NOT NULL,
	"honors" text[] DEFAULT '{}' NOT NULL,
	"additional_info" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_preference" (
	"user_id" text PRIMARY KEY NOT NULL,
	"notify_deadlines" boolean DEFAULT true NOT NULL,
	"notify_check_in" boolean DEFAULT true NOT NULL,
	"notify_nudges" boolean DEFAULT false NOT NULL,
	"share_essays_by_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"role" "role" DEFAULT 'student' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "weekly_check_in" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" text NOT NULL,
	"week_of" date NOT NULL,
	"mode" "grade_mode" NOT NULL,
	"dismissed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity" ADD CONSTRAINT "activity_student_id_user_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "aid_offer" ADD CONSTRAINT "aid_offer_student_id_user_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "aid_offer" ADD CONSTRAINT "aid_offer_school_id_school_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."school"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "aid_status" ADD CONSTRAINT "aid_status_student_id_user_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "check_in_action" ADD CONSTRAINT "check_in_action_check_in_id_weekly_check_in_id_fk" FOREIGN KEY ("check_in_id") REFERENCES "public"."weekly_check_in"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "counselor_message" ADD CONSTRAINT "counselor_message_thread_id_counselor_thread_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."counselor_thread"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "counselor_thread" ADD CONSTRAINT "counselor_thread_student_id_user_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_plan_entry" ADD CONSTRAINT "course_plan_entry_student_id_user_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decision_note" ADD CONSTRAINT "decision_note_student_id_user_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decision_note" ADD CONSTRAINT "decision_note_school_id_school_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."school"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "essay_share" ADD CONSTRAINT "essay_share_essay_id_essay_id_fk" FOREIGN KEY ("essay_id") REFERENCES "public"."essay"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "essay_share" ADD CONSTRAINT "essay_share_granted_to_user_id_user_id_fk" FOREIGN KEY ("granted_to_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "essay_version" ADD CONSTRAINT "essay_version_essay_id_essay_id_fk" FOREIGN KEY ("essay_id") REFERENCES "public"."essay"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "essay" ADD CONSTRAINT "essay_student_id_user_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "essay" ADD CONSTRAINT "essay_school_id_school_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."school"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interview_session" ADD CONSTRAINT "interview_session_student_id_user_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interview_session" ADD CONSTRAINT "interview_session_school_id_school_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."school"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interview_turn" ADD CONSTRAINT "interview_turn_session_id_interview_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."interview_session"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "list_entry" ADD CONSTRAINT "list_entry_student_id_user_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "list_entry" ADD CONSTRAINT "list_entry_school_id_school_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."school"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parent_profile" ADD CONSTRAINT "parent_profile_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parent_student_link" ADD CONSTRAINT "parent_student_link_student_id_user_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parent_student_link" ADD CONSTRAINT "parent_student_link_parent_id_user_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recently_viewed" ADD CONSTRAINT "recently_viewed_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recently_viewed" ADD CONSTRAINT "recently_viewed_school_id_school_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."school"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommender_school" ADD CONSTRAINT "recommender_school_recommender_id_recommender_id_fk" FOREIGN KEY ("recommender_id") REFERENCES "public"."recommender"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommender_school" ADD CONSTRAINT "recommender_school_school_id_school_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."school"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommender" ADD CONSTRAINT "recommender_student_id_user_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "school_admissions" ADD CONSTRAINT "school_admissions_school_id_school_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."school"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "school_cost" ADD CONSTRAINT "school_cost_school_id_school_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."school"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "school_deadline" ADD CONSTRAINT "school_deadline_school_id_school_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."school"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "school_outcome" ADD CONSTRAINT "school_outcome_school_id_school_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."school"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_profile" ADD CONSTRAINT "student_profile_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "universal_profile" ADD CONSTRAINT "universal_profile_student_id_user_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_preference" ADD CONSTRAINT "user_preference_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_check_in" ADD CONSTRAINT "weekly_check_in_student_id_user_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "counselor_message_thread_idx" ON "counselor_message" USING btree ("thread_id");--> statement-breakpoint
CREATE INDEX "counselor_thread_student_idx" ON "counselor_thread" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "essay_version_essay_idx" ON "essay_version" USING btree ("essay_id");--> statement-breakpoint
CREATE INDEX "essay_student_idx" ON "essay" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "list_entry_student_idx" ON "list_entry" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "psl_student_idx" ON "parent_student_link" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "psl_parent_idx" ON "parent_student_link" USING btree ("parent_id");