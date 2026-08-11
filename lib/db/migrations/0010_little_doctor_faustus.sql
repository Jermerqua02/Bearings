ALTER TABLE "school" ALTER COLUMN "research_opportunities" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "school" ALTER COLUMN "research_opportunities" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "school" ALTER COLUMN "co_op" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "school" ALTER COLUMN "co_op" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "school" ALTER COLUMN "greek_life_presence" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "school" ALTER COLUMN "greek_life_presence" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "school" ALTER COLUMN "d1_athletics" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "school" ALTER COLUMN "d1_athletics" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "school" ALTER COLUMN "housing_guaranteed" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "school" ALTER COLUMN "housing_guaranteed" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "school" ALTER COLUMN "cost_of_living" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "school" ALTER COLUMN "cost_of_living" DROP NOT NULL;--> statement-breakpoint
-- Rows already written carry the old defaults, which is the whole problem:
-- "false" and "low" and "moderate" were stored for schools nobody had
-- assessed, and are indistinguishable from a real answer once they're in the
-- column. Null them for everything that wasn't hand-written, so "we don't
-- know" is what the data actually says.
UPDATE "school" SET
  "research_opportunities" = NULL,
  "co_op" = NULL,
  "greek_life_presence" = NULL,
  "d1_athletics" = NULL,
  "housing_guaranteed" = NULL,
  "cost_of_living" = NULL
WHERE "curated" = false;
