/*
  real → double precision, via text.

  These columns are compared against thresholds — an admit rate against 0.45,
  0.5 and 0.75; a GPA against a school's mid-50% — and `real` is a 4-byte
  float, so 0.45 is stored as 0.4499999880790710. Postgres compared that
  widened value against the literal 0.45 and said false, while the driver
  handed JavaScript the text "0.45" and it said true. Two implementations of
  one rule disagreed on exactly one school, which is how it surfaced.

  A plain ALTER widens the stored approximation and changes nothing. Going
  through text reparses the decimal that was intended — "0.45" → 0.45 — so
  the database and the application finally hold the same number.
*/
ALTER TABLE "school_admissions" ALTER COLUMN "acceptance_rate" SET DATA TYPE double precision USING "acceptance_rate"::text::double precision;--> statement-breakpoint
ALTER TABLE "school_admissions" ALTER COLUMN "gpa_mid50_low" SET DATA TYPE double precision USING "gpa_mid50_low"::text::double precision;--> statement-breakpoint
ALTER TABLE "school_admissions" ALTER COLUMN "gpa_mid50_high" SET DATA TYPE double precision USING "gpa_mid50_high"::text::double precision;--> statement-breakpoint
ALTER TABLE "school_cost" ALTER COLUMN "percent_need_met" SET DATA TYPE double precision USING "percent_need_met"::text::double precision;--> statement-breakpoint
ALTER TABLE "school_outcome" ALTER COLUMN "grad_rate" SET DATA TYPE double precision USING "grad_rate"::text::double precision;--> statement-breakpoint
ALTER TABLE "student_profile" ALTER COLUMN "self_reported_gpa_weighted" SET DATA TYPE double precision USING "self_reported_gpa_weighted"::text::double precision;--> statement-breakpoint
ALTER TABLE "student_profile" ALTER COLUMN "self_reported_gpa_unweighted" SET DATA TYPE double precision USING "self_reported_gpa_unweighted"::text::double precision;
