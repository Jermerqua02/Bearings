/* Pro status test. Run: npm run test:entitlements */
import "./_env";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { aiUsage, entitlements, parentStudentLinks, users } from "@/lib/db/schema";
import { FREE_SAMPLE, assertFeature, proStatus, proStatuses, sampleLeft } from "@/lib/entitlements";
import { ProRequired } from "@/lib/actions/_error";

let failures = 0;
const check = (l: string, ok: boolean, d?: string) => {
  console.log(ok ? `  ✓ ${l}` : `  ✗ ${l}${d ? ` — ${d}` : ""}`);
  if (!ok) failures++;
};

const S = "pro-test-student", P = "pro-test-parent", A = "pro-test-admin", O = "pro-test-other";
const EMAILS = ["pro-student@lumni.invalid", "pro-parent@lumni.invalid", "pro-admin@lumni.invalid", "pro-other@lumni.invalid"];
const day = 86_400_000;

async function cleanup() { await db.delete(users).where(inArray(users.email, EMAILS)); }
const tier = async (id: string, role?: string) => (await proStatus(id, role)).tier;

async function main() {
  console.log("\nPro status\n");
  await cleanup();
  await db.insert(users).values([
    { id: S, name: "Student", email: EMAILS[0], role: "student" },
    { id: P, name: "Parent", email: EMAILS[1], role: "parent" },
    { id: A, name: "Admin", email: EMAILS[2], role: "admin" },
    { id: O, name: "Other", email: EMAILS[3], role: "student" },
  ]);

  console.log("Defaults");
  check("a new student is Free", (await tier(S)) === "free");
  check("an admin is Pro by role", (await proStatus(A, "admin")).tier === "pro");

  console.log("\nGrants and their dates");
  await db.insert(entitlements).values({ userId: S, source: "admin", endsAt: new Date(Date.now() + 30 * day) });
  const st = await proStatus(S);
  check("a dated grant makes them Pro", st.tier === "pro" && st.source === "admin" && st.via === "own");
  await db.delete(entitlements).where(eq(entitlements.userId, S));
  await db.insert(entitlements).values({ userId: S, source: "admin", startsAt: new Date(Date.now() - 40 * day), endsAt: new Date(Date.now() - day) });
  check("an expired grant doesn't", (await tier(S)) === "free");
  await db.insert(entitlements).values({ userId: S, source: "admin", startsAt: new Date(Date.now() + day) });
  check("a grant that hasn't started doesn't", (await tier(S)) === "free");
  await db.insert(entitlements).values({ userId: S, source: "free_access", endsAt: null });
  const open = await proStatus(S);
  check("an open-ended grant does, with no end date", open.tier === "pro" && open.endsAt === null && open.source === "free_access");
  await db.update(entitlements).set({ revokedAt: new Date() }).where(eq(entitlements.userId, S));
  check("revoking ends it", (await tier(S)) === "free");

  console.log("\nShared across a parent link");
  await db.insert(entitlements).values({ userId: P, source: "app_store", endsAt: new Date(Date.now() + 30 * day), productId: "test" });
  check("before linking, the parent's Pro is theirs alone", (await tier(S)) === "free" && (await tier(P, "parent")) === "pro");
  await db.insert(parentStudentLinks).values({ studentId: S, parentId: P, parentEmail: EMAILS[1], status: "active", inviteToken: "pro-test-token" });
  const shared = await proStatus(S);
  check("once linked, the student has it too, via family", shared.tier === "pro" && shared.via === "family" && shared.source === "app_store");
  check("an unlinked student doesn't", (await tier(O)) === "free");
  await db.insert(entitlements).values({ userId: S, source: "admin" });
  check("their own grant is preferred over the family's", (await proStatus(S)).tier === "pro" && ((await proStatus(S)) as { via: string }).via === "own");
  await db.update(entitlements).set({ revokedAt: new Date() }).where(eq(entitlements.userId, S));
  await db.update(parentStudentLinks).set({ status: "revoked", revokedAt: new Date() }).where(eq(parentStudentLinks.studentId, S));
  check("revoking the link ends the sharing", (await tier(S)) === "free");

  console.log("\nThe roster, in one pass");
  const all = await proStatuses([{ userId: S, role: "student" }, { userId: P, role: "parent" }, { userId: A, role: "admin" }, { userId: O, role: "student" }]);
  check("matches the one-at-a-time answers",
    all.get(S)?.tier === "free" && all.get(P)?.tier === "pro" && all.get(A)?.tier === "pro" && all.get(O)?.tier === "free");

  console.log("\nWhat Free can do");
  const refused = async (f: () => Promise<void>) => { try { await f(); return false; } catch (e) { return e instanceof ProRequired; } };
  check("Free starts with the whole sample", JSON.stringify(await sampleLeft(O)) === JSON.stringify(FREE_SAMPLE));
  check("Free can use a chat message from the sample", !(await refused(() => assertFeature(O, "chat"))));
  await db.insert(aiUsage).values(Array.from({ length: FREE_SAMPLE.chat }, () => ({ userId: O, feature: "chat" as const, model: "test", inputTokens: 0, outputTokens: 0, costMillicents: 1 })));
  check("…and is refused once it's used", await refused(() => assertFeature(O, "chat")));
  check("interview practice has no free sample", await refused(() => assertFeature(O, "interview")));
  check("Pro-only features are refused for Free", await refused(() => assertFeature(O, "why_school")) && await refused(() => assertFeature(O, "transcript")));
  await db.insert(entitlements).values({ userId: O, source: "admin" });
  check("Pro has no sample limit", !(await refused(() => assertFeature(O, "chat"))) && !(await refused(() => assertFeature(O, "why_school"))));
  check("an admin is never refused", !(await refused(() => assertFeature(A, "why_school"))));

  await cleanup();
  console.log(failures === 0 ? "\nAll checks passed.\n" : `\n${failures} failed.\n`);
  process.exit(failures === 0 ? 0 : 1);
}
main().catch(async (e) => { console.error(e); await cleanup().catch(() => {}); process.exit(1); });
