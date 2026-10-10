/* ————————————————————————————————————————
   Give every account that exists today Pro, with no end date, before the
   Free tier's locks switch on — so the people already using Lumni lose
   nothing the day Pro arrives (docs/plans/lumni-pro.md, step 2).

     NODE_OPTIONS=--conditions=react-server tsx scripts/grant-existing-pro.ts [--dry]

   Skips admins (Pro by role) and anyone who already holds an entitlement.
   Each grant is a normal admin-source entitlement with a note, and goes in
   the account's history, so it can be seen and revoked in the portal like
   any other.
   ———————————————————————————————————————— */

import "./_env";

import { and, ne, notInArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { accountEvents, entitlements, users } from "@/lib/db/schema";

const NOTE = "Using Lumni before Pro launched";

async function main() {
  const dry = process.argv.includes("--dry");
  const holders = db.select({ id: entitlements.userId }).from(entitlements);
  const eligible = (
    await db
      .select({ id: users.id })
      .from(users)
      .where(and(ne(users.role, "admin"), notInArray(users.id, holders)))
  ).map((u) => u.id);

  console.log(`${eligible.length} account(s) to grant${dry ? " (dry run)" : ""}`);
  if (dry || eligible.length === 0) process.exit(0);

  await db.transaction(async (tx) => {
    const rows = await tx
      .insert(entitlements)
      .values(eligible.map((userId) => ({ userId, source: "admin" as const, note: NOTE })))
      .returning({ id: entitlements.id, userId: entitlements.userId });
    await tx.insert(accountEvents).values(
      rows.map((r) => ({
        userId: r.userId,
        actorKind: "system",
        action: "pro.granted",
        reason: NOTE,
        detail: { entitlementId: r.id, source: "admin", endsAt: null },
      })),
    );
  });
  console.log(`Granted Pro to ${eligible.length} account(s).`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
