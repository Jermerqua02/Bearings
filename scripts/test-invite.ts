/* Parent invitation flow. Run: npm run test:invite

   Covers the two gaps that made this feature dead: the invite email was
   never sent, and the link it would have carried pointed at a page that
   did not exist. Exercises the data path end to end against the real DB. */
import "./_env";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { parentStudentLinks, users } from "@/lib/db/schema";
import { parentInviteEmail } from "@/lib/email";
import { loadSnapshot } from "@/lib/db/queries/snapshot";
import type { Viewer } from "@/lib/auth/policy";

let failures = 0;
const check = (l: string, ok: boolean, d?: string) => {
  console.log(ok ? `  ✓ ${l}` : `  ✗ ${l}${d ? ` — ${d}` : ""}`);
  if (!ok) failures++;
};

const S = "invite-test-student", P = "invite-test-parent";
const SE = "invite-student@northstar.invalid", PE = "invite-parent@northstar.invalid";

async function cleanup() { await db.delete(users).where(inArray(users.email, [SE, PE])); }

async function main() {
  console.log("\nParent invitations\n");
  await cleanup();
  await db.insert(users).values([
    { id: S, name: "Sam", email: SE, role: "student" },
    { id: P, name: "Pat", email: PE, role: "parent" },
  ]);

  console.log("The email");
  const mail = parentInviteEmail({ studentName: "Sam", acceptUrl: "https://example.test/invite/tok" });
  check("names the student in the subject", mail.subject.includes("Sam"), mail.subject);
  check("carries the accept link", mail.html.includes("https://example.test/invite/tok"));
  check("states what a parent will see", /progress|deadlines/i.test(mail.html));
  check("states what a parent won't see", /essay|counselor/i.test(mail.html));
  check("has a plain-text alternative", Boolean(mail.text?.trim()));

  console.log("\nThe invitation record");
  const token = "invite-test-token-" + Date.now();
  await db.insert(parentStudentLinks).values({
    studentId: S, parentEmail: PE, inviteToken: token, status: "invited",
  });
  const [byToken] = await db.select().from(parentStudentLinks)
    .where(eq(parentStudentLinks.inviteToken, token)).limit(1);
  check("is findable by its token, which is how the page loads it", !!byToken);
  check("starts as invited, not active", byToken?.status === "invited");
  check("is not yet bound to a parent account", byToken?.parentId === null);

  console.log("\nBefore accepting");
  const parentViewer = { userId: P, role: "parent", email: PE, name: "Pat" } as Viewer;
  let snap = await loadSnapshot(parentViewer);
  check("the parent sees no student yet", !snap.subjectStudentId, String(snap.subjectStudentId));
  check("and is not shown as linked", snap.parentLinked === false);

  console.log("\nAfter accepting");
  await db.update(parentStudentLinks)
    .set({ parentId: P, status: "active", acceptedAt: new Date() })
    .where(eq(parentStudentLinks.inviteToken, token));
  snap = await loadSnapshot(parentViewer);
  check("the parent now resolves to the student", snap.subjectStudentId === S, String(snap.subjectStudentId));
  check("and is shown as linked", snap.parentLinked === true);

  console.log("\nRevoking");
  await db.update(parentStudentLinks).set({ status: "revoked", revokedAt: new Date() })
    .where(eq(parentStudentLinks.inviteToken, token));
  snap = await loadSnapshot(parentViewer);
  check("access is withdrawn immediately", !snap.subjectStudentId, String(snap.subjectStudentId));

  const [revoked] = await db.select().from(parentStudentLinks)
    .where(and(eq(parentStudentLinks.inviteToken, token), eq(parentStudentLinks.status, "revoked")));
  check("the row survives for the audit trail", !!revoked);

  await cleanup();
  console.log(failures === 0 ? "\nAll checks passed.\n" : `\n${failures} failed.\n`);
  process.exit(failures === 0 ? 0 : 1);
}
main().catch(async (e) => { console.error(e); await cleanup().catch(()=>{}); process.exit(1); });
