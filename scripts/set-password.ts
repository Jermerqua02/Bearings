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

/**
 * Ask for the password twice.
 *
 * Two paths, because they have genuinely different problems.
 *
 * On a terminal: readline with echo suppressed, so the password isn't
 * left on screen.
 *
 * On piped input (tests, CI): read stdin to the end first and split it.
 * Asking sequentially loses the second line — readline emits every line as
 * soon as the pipe closes, which is before the first answer's promise has
 * resolved and registered a handler for the next one.
 */
async function promptTwice(first: string, second: string): Promise<[string, string]> {
  if (process.stdin.isTTY !== true) {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
    const lines = Buffer.concat(chunks).toString("utf8").split(/\r?\n/);
    if (lines.length < 2 || !lines[0]) throw new Error("Expected two lines on stdin.");
    return [lines[0]!, lines[1] ?? ""];
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  const output = rl as unknown as { _writeToOutput?: (s: string) => void };

  const ask = (question: string) =>
    new Promise<string>((resolve) => {
      process.stdout.write(question);
      // Swallow the echo of each keypress; the prompt is already written.
      output._writeToOutput = () => {};
      rl.question("", (answer) => {
        process.stdout.write("\n");
        resolve(answer);
      });
    });

  try {
    return [await ask(first), await ask(second)];
  } finally {
    rl.close();
  }
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

  const [password, again] = await promptTwice(`New password for ${email}: `, "Confirm: ");
  if (password.length < minLength) {
    console.error(`Password must be at least ${minLength} characters.`);
    process.exit(1);
  }
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
