CREATE TYPE "public"."lead_status" AS ENUM('new', 'contacted', 'piloting', 'customer', 'closed');--> statement-breakpoint
CREATE TYPE "public"."request_status" AS ENUM('pending', 'approved', 'declined');--> statement-breakpoint
CREATE TABLE "free_access_request" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"message" text NOT NULL,
	"school_name" text,
	"status" "request_status" DEFAULT 'pending' NOT NULL,
	"decided_by" text,
	"decided_at" timestamp with time zone,
	"decision_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "school_lead" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_name" text NOT NULL,
	"contact_name" text NOT NULL,
	"role" text,
	"email" text NOT NULL,
	"students" integer,
	"message" text,
	"source" text NOT NULL,
	"user_id" text,
	"status" "lead_status" DEFAULT 'new' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "school_license" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_name" text NOT NULL,
	"contact_email" text,
	"seats" integer NOT NULL,
	"starts_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"code" text NOT NULL,
	"price_cents" integer,
	"invoice_status" text DEFAULT 'pilot' NOT NULL,
	"lead_id" uuid,
	"revoked_at" timestamp with time zone,
	"notes" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "school_license_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "seat_redemption" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"license_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"entitlement_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "seat_redemption_once" UNIQUE("license_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "free_access_request" ADD CONSTRAINT "free_access_request_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "free_access_request" ADD CONSTRAINT "free_access_request_decided_by_user_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "school_lead" ADD CONSTRAINT "school_lead_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "school_license" ADD CONSTRAINT "school_license_lead_id_school_lead_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."school_lead"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "school_license" ADD CONSTRAINT "school_license_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seat_redemption" ADD CONSTRAINT "seat_redemption_license_id_school_license_id_fk" FOREIGN KEY ("license_id") REFERENCES "public"."school_license"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seat_redemption" ADD CONSTRAINT "seat_redemption_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seat_redemption" ADD CONSTRAINT "seat_redemption_entitlement_id_entitlement_id_fk" FOREIGN KEY ("entitlement_id") REFERENCES "public"."entitlement"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "free_access_user_idx" ON "free_access_request" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "free_access_status_idx" ON "free_access_request" USING btree ("status");--> statement-breakpoint
CREATE INDEX "school_lead_status_idx" ON "school_lead" USING btree ("status");--> statement-breakpoint
CREATE INDEX "seat_redemption_license_idx" ON "seat_redemption" USING btree ("license_id");