CREATE TABLE "school_tuition_program" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" text NOT NULL,
	"program" text NOT NULL,
	"eligible_states" text[] NOT NULL,
	"restrictions" text,
	"url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "school_tuition_program_school" UNIQUE("school_id","program")
);
--> statement-breakpoint
ALTER TABLE "counselor_thread" ADD COLUMN "school_id" text;--> statement-breakpoint
ALTER TABLE "school_cost" ADD COLUMN "tuition_in_state" integer;--> statement-breakpoint
ALTER TABLE "school_cost" ADD COLUMN "tuition_out_of_state" integer;--> statement-breakpoint
ALTER TABLE "school_outcome" ADD COLUMN "grad_rate_4yr" double precision;--> statement-breakpoint
ALTER TABLE "student_profile" ADD COLUMN "home_state" text;--> statement-breakpoint
ALTER TABLE "school_tuition_program" ADD CONSTRAINT "school_tuition_program_school_id_school_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."school"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "counselor_thread" ADD CONSTRAINT "counselor_thread_school_id_school_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."school"("id") ON DELETE set null ON UPDATE no action;