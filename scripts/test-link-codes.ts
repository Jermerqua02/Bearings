/* Linking by code. Run: npm run test:links */
import "./_env";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { entitlements, linkCodes, users } from "@/lib/db/schema";
import { createLinkCode, linkedPerson, redeemLinkCode, unlink } from "@/lib/link-codes";
import { proStatus } from "@/lib/entitlements";
import { UserFacingError } from "@/lib/actions/_error";
import type { Viewer } from "@/lib/auth/policy";

let failures = 0;
const check = (l: string, ok: boolean, d?: string) => {
  console.log(ok ? `  ✓ ${l}` : `  ✗ ${l}${d ? ` — ${d}` : ""}`);
  if (!ok) failures++;
};
const v = (userId: string, role: "student" | "parent", email: string): Viewer => ({ userId, role, email, name: userId });
const S = v("lc-student", "student", "lc-student@lumni.invalid");
const S2 = v("lc-student2", "student", "lc-student2@lumni.invalid");
const P = v("lc-parent", "parent", "lc-parent@lumni.invalid");
const P2 = v("lc-parent2", "parent", "lc-parent2@lumni.invalid");
const ALL = [S, S2, P, P2];

async function cleanup() { await db.delete(users).where(inArray(users.email, ALL.map((x) => x.email))); }
async function refused(f: () => Promise<unknown>) { try { await f(); return null; } catch (e) { return e instanceof UserFacingError ? e.message : `unexpected: ${e}`; } }

async function main() {
  console.log("\nLinking by code\n");
  await cleanup();
  await db.insert(users).values(ALL.map((x) => ({ id: x.userId, name: x.name, email: x.email, role: x.role })));

  const { code } = await createLinkCode(S);
  check("a code looks like 7Q2-K9M", /^[2-9A-HJKMNP-Z]{3}-[2-9A-HJKMNP-Z]{3}$/.test(code), code);
  check("your own code is refused", (await refused(() => redeemLinkCode(S, code)))?.includes("your own code") ?? false);
  check("a student can't use another student's code", (await refused(() => redeemLinkCode(S2, code)))?.includes("another student") ?? false);
  check("a garbled code is refused", (await refused(() => redeemLinkCode(P, "12")))?.includes("six letters") ?? false);

  const linked = await redeemLinkCode(P, code.toLowerCase().replace("-", " "));
  check("the parent enters it (case and spacing don't matter) and they're linked", linked.role === "student" && (await linkedPerson(S))?.email === P.email);
  check("the same code can't be used twice", (await refused(() => redeemLinkCode(P2, code)))?.includes("isn't valid") ?? false);
  check("a linked parent can't make another code", (await refused(() => createLinkCode(P)))?.includes("already linked") ?? false);

  const { code: c2 } = await createLinkCode(S2);
  check("one to one: a linked parent can't take a second student", (await refused(() => redeemLinkCode(P, c2)))?.includes("already linked") ?? false);

  console.log("\nPro is shared across the link");
  await db.insert(entitlements).values({ userId: P.userId, source: "admin" });
  check("the parent's Pro covers their student", (await proStatus(S.userId, "student")).tier === "pro");
  check("but not a student they aren't linked to", (await proStatus(S2.userId, "student")).tier === "free");

  console.log("\nUnlinking");
  await unlink(S);
  check("either side can unlink, and the sharing ends", !(await linkedPerson(P)) && (await proStatus(S.userId, "student")).tier === "free");
  const { code: c3 } = await createLinkCode(P);
  await redeemLinkCode(S2, c3);
  check("after unlinking, the parent can link someone new", (await linkedPerson(P))?.email === S2.email);

  console.log("\nExpiry");
  await unlink(P);
  const { code: c4 } = await createLinkCode(S);
  await db.update(linkCodes).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(linkCodes.createdBy, S.userId));
  check("an expired code is refused", (await refused(() => redeemLinkCode(P, c4)))?.includes("isn't valid") ?? false);

  await cleanup();
  console.log(failures === 0 ? "\nAll checks passed.\n" : `\n${failures} failed.\n`);
  process.exit(failures === 0 ? 0 : 1);
}
main().catch(async (e) => { console.error(e); await cleanup().catch(() => {}); process.exit(1); });
