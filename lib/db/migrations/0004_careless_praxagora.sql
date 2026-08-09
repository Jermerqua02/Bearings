CREATE TYPE "public"."legal_document" AS ENUM('terms', 'privacy');--> statement-breakpoint
CREATE TABLE "legal_consent" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"document" "legal_document" NOT NULL,
	"version" text NOT NULL,
	"accepted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "legal_consent_unique" UNIQUE("user_id","document","version")
);
--> statement-breakpoint
ALTER TABLE "legal_consent" ADD CONSTRAINT "legal_consent_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "legal_consent_user_idx" ON "legal_consent" USING btree ("user_id");