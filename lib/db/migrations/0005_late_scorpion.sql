CREATE TYPE "public"."feedback_status" AS ENUM('open', 'resolved');--> statement-breakpoint
CREATE TABLE "admin_settings" (
	"id" text PRIMARY KEY DEFAULT 'singleton' NOT NULL,
	"monthly_budget_usd" integer DEFAULT 25 NOT NULL,
	"alert_thresholds" integer[] DEFAULT '{80,100}' NOT NULL,
	"alert_email" text DEFAULT '' NOT NULL,
	"alerts_enabled" boolean DEFAULT true NOT NULL,
	"last_alert_at" timestamp with time zone,
	"last_alert_threshold" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text,
	"email" text DEFAULT '' NOT NULL,
	"message" text NOT NULL,
	"path" text DEFAULT '' NOT NULL,
	"status" "feedback_status" DEFAULT 'open' NOT NULL,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "feedback_status_idx" ON "feedback" USING btree ("status");--> statement-breakpoint
CREATE INDEX "feedback_created_idx" ON "feedback" USING btree ("created_at");