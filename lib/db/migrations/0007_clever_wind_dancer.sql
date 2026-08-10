CREATE TABLE "school_logo" (
	"school_id" text PRIMARY KEY NOT NULL,
	"bytes" "bytea" NOT NULL,
	"content_type" text DEFAULT 'image/png' NOT NULL,
	"source_url" text DEFAULT '' NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "school" ADD COLUMN "website" text;--> statement-breakpoint
ALTER TABLE "school" ADD COLUMN "ipeds_id" integer;--> statement-breakpoint
ALTER TABLE "school_logo" ADD CONSTRAINT "school_logo_school_id_school_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."school"("id") ON DELETE cascade ON UPDATE no action;