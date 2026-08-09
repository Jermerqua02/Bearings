CREATE TABLE "school_explanation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" text NOT NULL,
	"school_id" text NOT NULL,
	"text" text NOT NULL,
	"profile_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "school_explanation_unique" UNIQUE("student_id","school_id")
);
--> statement-breakpoint
ALTER TABLE "school_explanation" ADD CONSTRAINT "school_explanation_student_id_user_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "school_explanation" ADD CONSTRAINT "school_explanation_school_id_school_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."school"("id") ON DELETE cascade ON UPDATE no action;