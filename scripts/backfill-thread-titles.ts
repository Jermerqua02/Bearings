/* ————————————————————————————————————————
   Name the conversations that never got a title.

     npm run backfill:thread-titles -- --dry
     npm run backfill:thread-titles

   Titling was broken from the start: the check asked whether the thread had
   no history, but a new thread is greeted before the student says anything,
   so the condition never held. Every conversation ever created is called
   "New conversation", which is what a student's sidebar looked like — eight
   identical rows and no way to tell them apart without opening each one.

   Fixing the live path only helps conversations from here on. This names the
   ones already there, from the exchange that started them.

   Threads where the student never said anything are left alone. "New
   conversation" is the honest name for a conversation that never happened,
   and the sidebar's delete menu is the right way to clear those.
   ———————————————————————————————————————— */

import "./_env";

import { and, asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { counselorMessages, counselorThreads } from "@/lib/db/schema";
import { createClaudeCounselor } from "@/lib/counselor/claude";
import { localTitle } from "@/lib/counselor";
import { schools } from "@/lib/db/schema";

const DEFAULT_TITLE = "New conversation";

async function knownSchoolIds(): Promise<Set<string>> {
  const rows = await db.select({ id: schools.id }).from(schools);
  return new Set(rows.map((r) => r.id));
}

async function main() {
  const dry = process.argv.includes("--dry");
  console.log(`\nThread titles${dry ? "  (dry run)" : ""}\n`);

  const untitled = await db
    .select({ id: counselorThreads.id, studentId: counselorThreads.studentId })
    .from(counselorThreads)
    .where(eq(counselorThreads.title, DEFAULT_TITLE));

  console.log(`  ${untitled.length} threads named "${DEFAULT_TITLE}"\n`);

  let named = 0;
  let empty = 0;

  for (const t of untitled) {
    const msgs = await db
      .select({ author: counselorMessages.author, text: counselorMessages.text })
      .from(counselorMessages)
      .where(eq(counselorMessages.threadId, t.id))
      .orderBy(asc(counselorMessages.createdAt));

    const firstAsk = msgs.find((m) => m.author === "user");
    if (!firstAsk) {
      empty++;
      continue;
    }
    // The counsellor's answer after that question, for context.
    const askAt = msgs.indexOf(firstAsk);
    const reply = msgs.slice(askAt + 1).find((m) => m.author === "counselor")?.text ?? "";

    let title: string;
    try {
      title = await createClaudeCounselor({
        knownSchoolIds,
        userId: t.studentId,
      }).titleFor(firstAsk.text, reply);
    } catch {
      console.log(`    ${t.id.slice(0, 8)} — model failed, using the student's own words`);
      title = localTitle(firstAsk.text);
    }

    console.log(`    "${title}"   ← ${firstAsk.text.replace(/\s+/g, " ").slice(0, 56)}…`);
    if (!dry) {
      await db
        .update(counselorThreads)
        .set({ title, updatedAt: new Date() })
        .where(and(eq(counselorThreads.id, t.id), eq(counselorThreads.title, DEFAULT_TITLE)));
    }
    named++;
  }

  console.log(`\n  ${named} named`);
  console.log(`  ${empty} left alone — the student never wrote in them\n`);
  process.exit(0);
}

main().catch((err) => {
  console.error(`\n${String(err).slice(0, 500)}\n`);
  process.exit(1);
});
