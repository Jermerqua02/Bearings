/* ————————————————————————————————————————
   Production migration runner.

   Runs on boot, before the server starts. Deliberately uses only production
   dependencies — drizzle-kit and tsx are devDependencies and are pruned in
   Railway's production install, so the CLI isn't available at runtime.
   ———————————————————————————————————————— */

import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set — cannot migrate.");
  process.exit(1);
}

// A dedicated single connection: migrations must not share the app pool.
const sql = postgres(url, { max: 1 });

try {
  await migrate(drizzle(sql), { migrationsFolder: "./lib/db/migrations" });
  console.log("migrations applied");
  await sql.end();
  process.exit(0);
} catch (err) {
  console.error("migration failed:", err);
  await sql.end();
  process.exit(1);
}
