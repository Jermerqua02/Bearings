ALTER TABLE "school" ADD COLUMN "curated" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- Backfill: before this column existed, "curated" was inferred from a null
-- ipeds_id. Two curated rows (Berkeley, UCLA) had already been matched to a
-- federal record by the importer and stamped, so the inference had started to
-- lose them. Anything carrying editorial prose was hand-written by definition.
UPDATE "school" SET "curated" = true WHERE "ipeds_id" IS NULL OR "vibe" <> '';
