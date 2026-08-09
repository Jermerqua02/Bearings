/* ————————————————————————————————————————
   Grant or revoke admin.

   Admin is deliberately not self-assignable — signup narrows to
   SELF_ASSIGNABLE_ROLES, and Better Auth's update-user rejects the field
   entirely. This script is the out-of-band path for the first admin; after
   that, admins can promote each other from the portal.

     npx tsx scripts/grant-admin.ts you@example.com
     npx tsx scripts/grant-admin.ts you@example.com --revoke
   ———————————————————————————————————————— */

import "./_env";

import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";

async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  const revoke = process.argv.includes("--revoke");

  if (!email) {
    console.error("Usage: npx tsx scripts/grant-admin.ts <email> [--revoke]");
    process.exit(1);
  }

  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!user) {
    console.error(`No account for ${email}. Sign up first, then run this.`);
    process.exit(1);
  }

  if (revoke) {
    if (user.role !== "admin") {
      console.error(`${email} is not an admin (role: ${user.role}).`);
      process.exit(1);
    }
    // Revoking returns them to student; there's no "no role" state.
    await db.update(users).set({ role: "student", updatedAt: new Date() }).where(eq(users.id, user.id));
    console.log(`revoked admin from ${email} — now a student`);
  } else {
    if (user.role === "admin") {
      console.log(`${email} is already an admin.`);
      process.exit(0);
    }
    await db.update(users).set({ role: "admin", updatedAt: new Date() }).where(eq(users.id, user.id));
    console.log(`granted admin to ${email} (was ${user.role})`);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
