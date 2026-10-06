ALTER TABLE "course_plan_entry" ADD COLUMN "term" text;--> statement-breakpoint
ALTER TABLE "course_plan_entry" ADD COLUMN "credits" double precision;--> statement-breakpoint
ALTER TABLE "transcript" ADD COLUMN "reported_gpa" double precision;--> statement-breakpoint
ALTER TABLE "transcript" ADD COLUMN "reported_gpa_weighted" double precision;--> statement-breakpoint
ALTER TABLE "transcript" ADD COLUMN "reported_credits" double precision;