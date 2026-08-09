/* ————————————————————————————————————————
   Privacy boundary integration test.

   Exercises lib/auth/policy.ts and lib/db/queries/student.ts against the
   real database with two real users and a real link. Asserts the thing the
   product promises and the code previously did not enforce: a linked parent
   can read the shared view and cannot read counselor threads, essay drafts,
   or interview turns.

   Run:  npx tsx scripts/test-boundary.ts
   ———————————————————————————————————————— */

import "./_env";

import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  counselorThreads,
  essayShares,
  essayVersions,
  essays,
  listEntries,
  parentStudentLinks,
  schools,
  users,
} from "@/lib/db/schema";
import {
  canRead,
  canReadEssay,
  essayVersionCutoff,
  isLinkedParent,
  type Viewer,
} from "@/lib/auth/policy";
import { getEssayVersions, getEssays } from "@/lib/db/queries/student";

let failures = 0;
let passes = 0;

function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    passes++;
    console.log(`  \x1b[32m✓\x1b[0m ${label}`);
  } else {
    failures++;
    console.log(`  \x1b[31m✗\x1b[0m ${label}\n      expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

const SID = "test-student-boundary";
const PID = "test-parent-boundary";
const OID = "test-other-parent-boundary";

async function cleanup() {
  for (const id of [SID, PID, OID]) {
    await db.delete(users).where(eq(users.id, id));
  }
  await db.delete(schools).where(eq(schools.id, "test-school-boundary"));
}

async function main() {
  await cleanup();

  // Fixtures
  await db.insert(users).values([
    { id: SID, name: "Test Student", email: "boundary-student@test.local", role: "student" },
    { id: PID, name: "Test Parent", email: "boundary-parent@test.local", role: "parent" },
    { id: OID, name: "Other Parent", email: "boundary-other@test.local", role: "parent" },
  ]);

  await db.insert(schools).values({
    id: "test-school-boundary",
    name: "Test University",
    shortName: "Test",
    city: "Testville",
    state: "OH",
    region: "midwest",
    type: "private",
    setting: "suburban",
    size: "medium",
    undergradEnrollment: 5000,
  });

  await db.insert(parentStudentLinks).values({
    studentId: SID,
    parentId: PID,
    parentEmail: "boundary-parent@test.local",
    inviteToken: "test-token-boundary",
    status: "active",
    acceptedAt: new Date(),
  });

  await db.insert(listEntries).values({
    studentId: SID,
    schoolId: "test-school-boundary",
    tier: "target",
    status: "applying",
  });

  const [privateEssay] = await db
    .insert(essays)
    .values({ studentId: SID, title: "Private draft", text: "SECRET_PRIVATE_TEXT" })
    .returning();
  const [sharedEssay] = await db
    .insert(essays)
    .values({ studentId: SID, title: "Shared draft", text: "SHARED_TEXT" })
    .returning();

  await db.insert(counselorThreads).values({ studentId: SID, title: "Private thread" });

  const student: Viewer = { userId: SID, role: "student", email: "s@t.local", name: "S" };
  const parent: Viewer = { userId: PID, role: "parent", email: "boundary-parent@test.local", name: "P" };
  const other: Viewer = { userId: OID, role: "parent", email: "boundary-other@test.local", name: "O" };

  console.log("\n\x1b[1mLinkage\x1b[0m");
  check("linked parent is recognized", await isLinkedParent(PID, SID), true);
  check("unlinked parent is not", await isLinkedParent(OID, SID), false);

  console.log("\n\x1b[1mShared view — parent may read\x1b[0m");
  check("list entries", await canRead(parent, "listEntries", SID), true);
  check("aid offers", await canRead(parent, "aidOffers", SID), true);
  check("decision notes", await canRead(parent, "decisionNotes", SID), true);

  console.log("\n\x1b[1mStudent-private — parent must NOT read\x1b[0m");
  check("counselor threads", await canRead(parent, "counselorThreads", SID), false);
  check("interview turns", await canRead(parent, "interviewTurns", SID), false);
  check("throughline", await canRead(parent, "throughline", SID), false);
  check("about-you panel", await canRead(parent, "aboutYouPanel", SID), false);
  check("universal profile (PII)", await canRead(parent, "universalProfile", SID), false);
  check("activities", await canRead(parent, "activities", SID), false);
  check("course plan", await canRead(parent, "coursePlan", SID), false);

  console.log("\n\x1b[1mUnlinked parent gets nothing\x1b[0m");
  check("list entries", await canRead(other, "listEntries", SID), false);
  check("essays", await canReadEssay(other, sharedEssay.id), false);

  console.log("\n\x1b[1mEssays — default private, per-grant exception\x1b[0m");
  check("student reads own", await canReadEssay(student, privateEssay.id), true);
  check("parent cannot read unshared", await canReadEssay(parent, privateEssay.id), false);

  await db.insert(essayShares).values({
    essayId: sharedEssay.id,
    grantedToUserId: PID,
    sharedAt: new Date(),
  });
  check("parent reads shared", await canReadEssay(parent, sharedEssay.id), true);
  check("sharing one does not leak the other", await canReadEssay(parent, privateEssay.id), false);

  console.log("\n\x1b[1mQuery layer — text must never be fetched\x1b[0m");
  const parentEssays = await getEssays(parent, SID);
  check("parent gets exactly 1 essay", parentEssays.length, 1);
  check("parent's essay is the shared one", parentEssays[0]?.title, "Shared draft");
  check(
    "SECRET_PRIVATE_TEXT absent from parent payload",
    JSON.stringify(parentEssays).includes("SECRET_PRIVATE_TEXT"),
    false,
  );
  const studentEssays = await getEssays(student, SID);
  check("student gets both", studentEssays.length, 2);

  console.log("\n\x1b[1mVersion history respects the share boundary\x1b[0m");
  const before = new Date(Date.now() - 60_000);
  await db.insert(essayVersions).values({
    essayId: sharedEssay.id,
    text: "OLD_REVISION_BEFORE_SHARE",
    savedAt: before,
  });
  await db.insert(essayVersions).values({
    essayId: sharedEssay.id,
    text: "NEW_REVISION_AFTER_SHARE",
    savedAt: new Date(Date.now() + 1000),
  });
  const parentVersions = await getEssayVersions(parent, sharedEssay.id);
  check(
    "pre-share revision hidden from parent",
    JSON.stringify(parentVersions).includes("OLD_REVISION_BEFORE_SHARE"),
    false,
  );
  check(
    "post-share revision visible",
    JSON.stringify(parentVersions).includes("NEW_REVISION_AFTER_SHARE"),
    true,
  );
  const studentVersions = await getEssayVersions(student, sharedEssay.id);
  check("student sees all revisions", studentVersions.length, 2);

  console.log("\n\x1b[1mRevocation\x1b[0m");
  await db
    .update(parentStudentLinks)
    .set({ status: "revoked", revokedAt: new Date() })
    .where(and(eq(parentStudentLinks.studentId, SID), eq(parentStudentLinks.parentId, PID)));
  check("shared view lost", await canRead(parent, "listEntries", SID), false);
  check("shared essay lost", await canReadEssay(parent, sharedEssay.id), false);
  const revokedGate = await essayVersionCutoff(parent, sharedEssay.id);
  check("version history lost", revokedGate.allowed, false);

  await cleanup();

  console.log(
    `\n${failures === 0 ? "\x1b[32m" : "\x1b[31m"}${passes} passed, ${failures} failed\x1b[0m\n`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error(err);
  await cleanup().catch(() => {});
  process.exit(1);
});
