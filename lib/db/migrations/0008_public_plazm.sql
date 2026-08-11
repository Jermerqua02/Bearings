ALTER TABLE "school_admissions" ALTER COLUMN "acceptance_rate" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "school_admissions" ALTER COLUMN "gpa_mid50_low" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "school_admissions" ALTER COLUMN "gpa_mid50_high" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "school_cost" ALTER COLUMN "sticker_price" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "school_cost" ALTER COLUMN "avg_net_price" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "school_cost" ALTER COLUMN "net_price_under_48k" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "school_cost" ALTER COLUMN "net_price_48_to_75k" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "school_cost" ALTER COLUMN "net_price_75_to_110k" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "school_cost" ALTER COLUMN "net_price_over_110k" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "school_cost" ALTER COLUMN "percent_need_met" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "school_cost" ALTER COLUMN "merit_aid" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "school_outcome" ALTER COLUMN "grad_rate" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "school_outcome" ALTER COLUMN "median_earnings_10yr" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "school_outcome" ALTER COLUMN "alumni_network" DROP NOT NULL;