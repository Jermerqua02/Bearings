/* Loads .env.local before anything else imports lib/db.
   Must be the first import in any script — ES imports are hoisted, so
   calling loadEnvConfig() inline in the script runs too late. */
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());
