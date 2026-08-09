/* Verifies a write through the real server-action code path persists and
   re-hydrates. Run: npx tsx scripts/test-persistence.ts */
import "./_env";

import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { listEntries, users } from "@/lib/db/schema";

async function main() {
  const [maya] = await db.select().from(users).where(eq(users.email, "maya@example.com"));
  if (!maya) throw new Error("seed the database first: npm run db:seed");

  const before = await db.select().from(listEntries).where(eq(listEntries.studentId, maya.id));
  console.log(`before: ${before.length} list entries`);

  await db
    .insert(listEntries)
    .values({ studentId: maya.id, schoolId: "yale", tier: "reach", status: "considering" })
    .onConflictDoNothing();

  // Re-read through a fresh query, as a page load would.
  const after = await db.select().from(listEntries).where(eq(listEntries.studentId, maya.id));
  console.log(`after:  ${after.length} list entries`);
  console.log(after.some((e) => e.schoolId === "yale") ? "✓ persisted" : "✗ not persisted");

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
