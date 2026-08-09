/* ————————————————————————————————————————
   Onboarding persistence test.

   The bug this covers: onboarding collected every answer and wrote none of
   them. setProfile() in lib/profile-context.tsx is React state, and the
   only INSERT into student_profile lived in scripts/seed.ts — so
   summarizeProfileAction() threw "Finish onboarding first." on the last
   question, and the flow froze there with no catch to report it.

   Asserts the write happens, that the snapshot then loads, and that
   re-running onboarding corrects rather than collides.

   Run:  npm run test:onboarding
   ———————————————————————————————————————— */

import "./_env";

import { eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { studentProfiles, users } from "@/lib/db/schema";
import { saveProfile } from "@/lib/db/queries/profile";
import { loadSnapshot } from "@/lib/db/queries/snapshot";
import type { StudentProfile } from "@/lib/types";
import type { Viewer } from "@/lib/auth/policy";

let failures = 0;
function check(label: string, ok: boolean, detail?: string) {
  if (ok) console.log(`  ✓ ${label}`);
  else {
    failures++;
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

const EMAIL = "onboarding-test@northstar.invalid";
const USER_ID = "test-onboarding-user";

const answers: StudentProfile = {
  role: "student",
  firstName: "Test",
  gradeLevel: 11,
  gpa: { unweighted: 3.8, weighted: 4.2 },
  rigor: { apCount: 4, ibCount: 0, honorsCount: 3 },
  testScores: { sat: 1380, act: undefined, planningToTest: true },
  intendedMajors: ["Computer Science"],
  undecided: false,
  activities: [],
  geography: { regions: ["midwest"] },
  campus: { sizes: [], settings: ["urban"] },
  budget: { maxPerYear: 30000, willFileFafsa: true },
  values: ["diversity", "mental-health-support"],
};

async function cleanup() {
  await db.delete(users).where(inArray(users.email, [EMAIL]));
}

async function main() {
  console.log("\nOnboarding persistence\n");
  await cleanup();

  await db.insert(users).values({
    id: USER_ID,
    name: "Test",
    email: EMAIL,
    role: "student",
  });

  const viewer: Viewer = {
    userId: USER_ID,
    role: "student",
    email: EMAIL,
    name: "Test",
  } as Viewer;

  console.log("Saving the profile");
  const before = await db
    .select()
    .from(studentProfiles)
    .where(eq(studentProfiles.userId, USER_ID));
  check("no profile row before onboarding", before.length === 0);

  await saveProfile(USER_ID, answers);
  check("the write completed without throwing", true);

  const [row] = await db
    .select()
    .from(studentProfiles)
    .where(eq(studentProfiles.userId, USER_ID));
  check("a profile row now exists", !!row);
  check("name persisted", row?.firstName === "Test");
  check("grade persisted", row?.gradeLevel === 11);
  check("self-reported GPA persisted", row?.selfReportedGpaUnweighted === 3.8);
  check("rigor persisted", row?.apCount === 4 && row?.honorsCount === 3);
  check("SAT persisted", row?.sat === 1380);
  check("majors persisted", row?.intendedMajors?.[0] === "Computer Science");
  check("regions persisted", row?.regions?.[0] === "midwest");
  check("campus settings persisted", row?.campusSettings?.[0] === "urban");
  check("budget persisted", row?.budgetMaxPerYear === 30000);
  check("values persisted", (row?.values?.length ?? 0) === 2);

  console.log("\nThe snapshot the counselor reads");
  const snap = await loadSnapshot(viewer);
  check(
    "loadSnapshot now finds a profile",
    !!snap.profile,
    "this returning null is what made summarizeProfileAction throw",
  );
  check("snapshot carries the name through", snap.profile?.firstName === "Test");

  console.log("\nRe-running onboarding");
  await saveProfile(USER_ID, { ...answers, firstName: "Corrected" });
  check("second run succeeds rather than colliding", true);

  const rows = await db.select().from(studentProfiles).where(eq(studentProfiles.userId, USER_ID));
  check("still exactly one row", rows.length === 1, `got ${rows.length}`);
  check("the correction took", rows[0]?.firstName === "Corrected");

  await cleanup();

  console.log(
    failures === 0 ? "\nAll checks passed.\n" : `\n${failures} failed.\n`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error(err);
  await cleanup().catch(() => {});
  process.exit(1);
});
