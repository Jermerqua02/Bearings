/* Unit test for the "never writes your essay" guardrail.
   Run: npx tsx scripts/test-guardrail.ts */
import "./_env";

import { enforceNeverWrites } from "@/lib/counselor/guardrails";

let pass = 0;
let fail = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  ok ? pass++ : fail++;
  console.log(
    `  ${ok ? "\x1b[32m✓\x1b[0m" : "\x1b[31m✗\x1b[0m"} ${label}` +
      (ok ? "" : `\n      expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`),
  );
}

const DRAFT = `The vet clinic smells like antiseptic and wet dog, and at six in the morning
the only sound is the hum of the fluorescent lights and a beagle named Rufus
who has decided that today is the day he learns to howl.`;

console.log("\n\x1b[1mLegitimate critique survives\x1b[0m");
{
  const { feedback, violations } = enforceNeverWrites(
    {
      observations: [
        { area: "structure", note: "The opening lands, but the middle loses the thread." },
        { area: "specificity", note: "You mention 'the clinic' abstractly after the first paragraph." },
        { area: "voice", note: "The humor in 'a beagle named Rufus' is you — there's less of it later." },
      ],
      questions: ["What did you actually think in that moment?", "Why did you keep going back?"],
    },
    DRAFT,
  );
  check("all 3 observations kept", feedback.observations.length, 3);
  check("both questions kept", feedback.questions.length, 2);
  check("no violations", violations.length, 0);
}

console.log("\n\x1b[1mGhostwriting is stripped\x1b[0m");
{
  const { feedback, violations } = enforceNeverWrites(
    {
      observations: [
        { area: "structure", note: "Here's a stronger version: The clinic taught me patience." },
        { area: "voice", note: 'You could write: "I learned that care is mostly repetition."' },
        { area: "specificity", note: "Name the moment you changed your mind." },
      ],
      questions: ["Try writing about the first time you failed.", "What surprised you?"],
    },
    DRAFT,
  );
  check("rewrite-shaped notes dropped", feedback.observations.length, 1);
  check("surviving note is the real critique", feedback.observations[0]?.area, "specificity");
  check("suggestion-as-question dropped", feedback.questions.length, 1);
  check("violations reported", violations.length >= 3, true);
}

console.log("\n\x1b[1mVerbatim regurgitation is caught\x1b[0m");
{
  const longRun =
    "the only sound is the hum of the fluorescent lights and a beagle named Rufus who has decided";
  const { feedback, violations } = enforceNeverWrites(
    {
      observations: [{ area: "voice", note: `Consider this: ${longRun} — polished up.` }],
      questions: [],
    },
    DRAFT,
  );
  check("long verbatim run dropped", feedback.observations.length, 0);
  check("violation names the run", violations.some((v) => /verbatim run/.test(v)), true);
}

console.log("\n\x1b[1mShort quotes are still allowed\x1b[0m");
{
  const { feedback } = enforceNeverWrites(
    {
      observations: [{ area: "voice", note: `"a beagle named Rufus" is the best line here.` }],
      questions: [],
    },
    DRAFT,
  );
  check("short quote kept", feedback.observations.length, 1);
}

console.log(`\n${fail === 0 ? "\x1b[32m" : "\x1b[31m"}${pass} passed, ${fail} failed\x1b[0m\n`);
process.exit(fail === 0 ? 0 : 1);
