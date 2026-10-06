/* ————————————————————————————————————————
   Every table that holds a person's input has something that writes to it.

     npm run test:persistence

   Five surfaces shipped with the same defect: the table was created, a read
   query was written, and the last wire from the UI was never run. Essay
   versions, notification preferences, interview turns, decision notes and
   recommender assignments all looked like working controls and saved
   nothing. Each was found by a person using the product, one at a time,
   after the data was already lost.

   The defect is structural, so the check can be too. This walks the schema,
   finds every table, and looks for an insert/update/delete against its
   Drizzle symbol somewhere in application code — not in scripts/, because a
   seed script writing a table is exactly the state all five were in.

   It replaces an earlier version that inserted a list entry with the
   database client and reported that the database had it. That passes
   whether or not any part of the product can write, which is the thing
   worth knowing.

   Adding a table with no writer yet is fine — put it in PENDING with a
   reason. The point is that it becomes a decision somebody made rather than
   an oversight nobody sees until a student loses an essay.
   ———————————————————————————————————————— */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/** Written by Better Auth itself, not by us. */
const EXTERNAL = new Set(["user", "session", "account", "verification"]);

/** Reference data. Scripts are the correct and only writer. */
const REFERENCE = new Set([
  "school",
  "school_admissions",
  "school_application",
  "school_cost",
  "school_outcome",
  "school_deadline",
  "school_logo",
  "opportunity",
]);

/** Deliberately unwritten for now. Give a reason, not just a name. */
const PENDING: Record<string, string> = {};

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next" || name === "migrations") continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|mjs)$/.test(p)) out.push(p);
  }
  return out;
}

function main() {
  const schema = readFileSync("lib/db/schema.ts", "utf8");
  const tables = [...schema.matchAll(/export const (\w+) = pgTable\(\s*"([^"]+)"/g)].map((m) => ({
    symbol: m[1],
    table: m[2],
  }));

  const sources = ["app", "lib", "components"]
    .flatMap((d) => walk(d))
    .filter((f) => !f.endsWith("schema.ts"))
    .map((f) => readFileSync(f, "utf8"));

  const missing: string[] = [];
  let checked = 0;

  for (const { symbol, table } of tables) {
    if (EXTERNAL.has(table) || REFERENCE.has(table)) continue;
    checked++;
    const writes = new RegExp(`\\.(insert|update|delete)\\(\\s*${symbol}\\b`);
    if (!sources.some((s) => writes.test(s)) && !(table in PENDING)) {
      missing.push(`${table}  (${symbol})`);
    }
  }

  console.log("\nPersistence\n");
  console.log(`  ${checked} tables hold user input; ${checked - missing.length} have a writer.`);
  for (const [t, why] of Object.entries(PENDING)) {
    console.log(`  \x1b[33m•\x1b[0m ${t} — pending: ${why}`);
  }

  if (missing.length > 0) {
    console.log("\n  \x1b[31m✗\x1b[0m no application code writes these:\n");
    for (const m of missing) console.log(`      ${m}`);
    console.log(
      "\n  If that's intentional, add it to PENDING in this file with a reason.\n" +
        "  If it isn't, something on screen is taking input and dropping it.\n",
    );
    process.exit(1);
  }

  console.log("\n  \x1b[32m✓\x1b[0m every table that holds user input has a writer\n");
  process.exit(0);
}

main();
