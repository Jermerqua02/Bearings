/* ————————————————————————————————————————
   Set an account's password.

   Email delivery isn't wired yet, so there is no reset link. This is the
   out-of-band path — the same role scripts/grant-admin.ts plays for roles.

   The password is read from a prompt with echo off, not from argv: an
   argument would land in shell history and in the process list, where
   anyone on the box can read it. It is never printed and never logged.

   Hashing goes through Better Auth's own helper rather than a hand-rolled
   one, so the stored value matches exactly what sign-in will verify
   against — including if the algorithm is upgraded later.

     npx tsx scripts/set-password.ts you@example.com
   ———————————————————————————————————————— */

import "./_env";

import { createInterface } from "node:readline";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";

/** Read a line without echoing it to the terminal. */
function prompt(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const output = rl as unknown as { output?: NodeJS.WriteStream; _writeToOutput?: unknown };
    process.stdout.write(question);
    // Swallow the echo of each keypress; the prompt itself is already written.
    output._writeToOutput = () => {};
    rl.question("", (answer) => {
      rl.close();
      process.stdout.write("\n");
      resolve(answer);
    });
  });
}

async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email) {
    console.error("Usage: npx tsx scripts/set-password.ts <email>");
    process.exit(1);
  }

  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!user) {
    console.error(`No account for ${email}.`);
    process.exit(1);
  }

  const ctx = await auth.$context;
  const minLength = ctx.options.emailAndPassword?.minPasswordLength ?? 8;

  const password = await prompt(`New password for ${email}: `);
  if (password.length < minLength) {
    console.error(`Password must be at least ${minLength} characters.`);
    process.exit(1);
  }
  const again = await prompt("Confirm: ");
  if (password !== again) {
    console.error("Passwords didn't match.");
    process.exit(1);
  }

  const hash = await ctx.password.hash(password);
  await ctx.internalAdapter.updatePassword(user.id, hash);

  console.log(`\nPassword updated for ${email} (role: ${user.role}).`);
  console.log("Existing sessions are left alone — sign out elsewhere if that matters.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
