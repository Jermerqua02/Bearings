ALTER TYPE "public"."ai_feature" ADD VALUE 'memory';--> statement-breakpoint
CREATE TABLE "counselor_memory" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" text NOT NULL,
	"category" text NOT NULL,
	"fact" text NOT NULL,
	"source" text DEFAULT 'chat' NOT NULL,
	"thread_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "counselor_memory" ADD CONSTRAINT "counselor_memory_student_id_user_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "counselor_memory" ADD CONSTRAINT "counselor_memory_thread_id_counselor_thread_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."counselor_thread"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "counselor_memory_student_idx" ON "counselor_memory" USING btree ("student_id");