/* Live end-to-end check of the Claude integration.
   Exercises the real service — prompt, tools, guardrail, metering — against
   the seeded demo student. Run: npx tsx scripts/test-live.ts */
import "./_env";

import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { aiUsage, users } from "@/lib/db/schema";
import { loadSnapshot } from "@/lib/db/queries/snapshot";
import type { Viewer } from "@/lib/auth/policy";
import type { StudentProfile } from "@/lib/types";

async function main() {
  const [maya] = await db.select().from(users).where(eq(users.email, "maya@example.com"));
  if (!maya) throw new Error("run npm run db:seed first");

  const viewer: Viewer = {
    userId: maya.id,
    role: "student",
    email: maya.email,
    name: maya.name,
  };
  const snap = await loadSnapshot(viewer);
  const profile = snap.profile as StudentProfile;
  console.log(`profile: ${profile.firstName}, grade ${profile.gradeLevel}\n`);

  const { createClaudeCounselor } = await import("@/lib/counselor/claude");
  const { getSchool } = await import("@/lib/data/schools");
  const service = createClaudeCounselor({
    knownSchoolIds: async () => {
      const { schools } = await import("@/lib/db/schema");
      const rows = await db.select({ id: schools.id }).from(schools);
      return new Set(rows.map((r) => r.id));
    },
    userId: maya.id,
  });

  console.log("\x1b[1m1. chat — asking for a tier breakdown (should emit a card)\x1b[0m");
  const chat = await service.chat({
    profile,
    threadId: "live-test",
    message: "Is my list realistic? Break down my reaches, targets, and likelies.",
    context: {
      listSummary:
        "The student's current list (6 schools):\n- University of Michigan (id: umich) — reach, EA, in-progress\n- Case Western Reserve University (id: case-western) — target, EA, submitted\n- University of Wisconsin–Madison (id: wisconsin) — target, EA, in-progress\n- College of Wooster (id: college-of-wooster) — likely, EA, submitted\n- Miami University (id: miami-ohio) — likely, EA, materials-received\n- University of Pittsburgh (id: pitt) — target, rolling, considering",
    },
    history: [],
  });
  console.log(chat.message.text.slice(0, 320) + "…");
  console.log("cards:", chat.message.cards?.map((c) => c.kind).join(", ") || "none");

  console.log("\n\x1b[1m2. whyThisSchool\x1b[0m");
  const why = await service.whyThisSchool(profile, getSchool("case-western")!);
  console.log(why);

  console.log("\n\x1b[1m3. essayFeedback — the guardrail under real output\x1b[0m");
  const fb = await service.essayFeedback(
    profile,
    "Share an essay on any topic of your choice.",
    "The vet clinic smells like antiseptic and wet dog. I started volunteering there because my mom made me. I stayed because of a beagle named Rufus who taught me that patience is mostly just showing up again the next day.",
  );
  fb.observations.forEach((o) => console.log(`  [${o.area}] ${o.note}`));
  fb.questions.forEach((q) => console.log(`  Q: ${q}`));

  console.log("\n\x1b[1m4. interviewTurn — nextQuestion must be structured\x1b[0m");
  const turn = (await service.interviewTurn(
    profile,
    getSchool("case-western")!,
    "Why are you interested in this school?",
    "I like that it has a good biology program and it's close to home.",
  )) as { strengths: string[]; toWorkOn: string[]; followUp: string; nextQuestion?: string };
  console.log("  strengths:", turn.strengths.join(" | "));
  console.log("  toWorkOn: ", turn.toWorkOn.join(" | "));
  console.log("  nextQuestion:", JSON.stringify(turn.nextQuestion));

  // Metering is fire-and-forget; give the inserts a moment.
  await new Promise((r) => setTimeout(r, 1500));

  console.log("\n\x1b[1m5. usage recorded\x1b[0m");
  const rows = await db.select().from(aiUsage).where(eq(aiUsage.userId, maya.id));
  let total = 0;
  for (const r of rows) {
    total += r.costMillicents;
    console.log(
      `  ${r.feature.padEnd(15)} in ${String(r.inputTokens).padStart(6)}  out ${String(r.outputTokens).padStart(5)}  ${(r.costMillicents / 1000).toFixed(3)}¢`,
    );
  }
  console.log(`  ${"TOTAL".padEnd(15)} ${(total / 1000).toFixed(2)}¢ across ${rows.length} calls`);

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
