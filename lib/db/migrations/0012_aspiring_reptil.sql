CREATE TYPE "public"."application_platform" AS ENUM('common-app', 'coalition', 'uc', 'cal-state', 'applytexas', 'direct');--> statement-breakpoint
CREATE TYPE "public"."fact_source" AS ENUM('ipeds', 'common-app', 'cds', 'curated');--> statement-breakpoint
CREATE TYPE "public"."requirement" AS ENUM('required', 'recommended', 'considered', 'not-considered');--> statement-breakpoint
CREATE TABLE "school_application" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" text NOT NULL,
	"cycle" text NOT NULL,
	"platform" "application_platform",
	"application_url" text,
	"net_price_calculator_url" text,
	"url_source" "fact_source",
	"open_admissions" boolean,
	"req_essay" "requirement",
	"req_recommendations" "requirement",
	"req_transcript" "requirement",
	"req_test_scores" "requirement",
	"req_gpa" "requirement",
	"req_class_rank" "requirement",
	"requirements_source" "fact_source",
	"requirements_year" text,
	"teacher_recs" integer,
	"other_recs" integer,
	"counselor_rec" boolean,
	"midyear_report" boolean,
	"writing_supplement" boolean,
	"courses_and_grades" boolean,
	"portfolio" text,
	"supplements_source" "fact_source",
	"fee_usd" integer,
	"fee_international_usd" integer,
	"fee_waiver" text,
	"fee_source" "fact_source",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "school_application_cycle" UNIQUE("school_id","cycle")
);
--> statement-breakpoint
ALTER TABLE "activity" ADD COLUMN "position" integer;--> statement-breakpoint
ALTER TABLE "recommender" ADD COLUMN "email" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "school_application" ADD CONSTRAINT "school_application_school_id_school_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."school"("id") ON DELETE cascade ON UPDATE no action;