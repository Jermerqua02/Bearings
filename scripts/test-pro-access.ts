/* Free access and school licenses. Run: npm run test:pro-access */
import "./_env";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { freeAccessRequests, schoolLeads, schoolLicenses, users } from "@/lib/db/schema";
import { decideFreeAccess, myFreeAccessRequest, requestFreeAccess } from "@/lib/free-access";
import { createSchoolLead, createSchoolLicense, redeemSchoolCode, revokeSchoolLicense } from "@/lib/school-licenses";
import { proStatus } from "@/lib/entitlements";
import { UserFacingError } from "@/lib/actions/_error";
import type { Viewer } from "@/lib/auth/policy";

let failures = 0;
const check = (l: string, ok: boolean, d?: string) => {
  console.log(ok ? `  ✓ ${l}` : `  ✗ ${l}${d ? ` — ${d}` : ""}`);
  if (!ok) failures++;
};
const v = (userId: string, role: "student" | "parent" | "admin", email: string): Viewer => ({ userId, role, email, name: userId });
const A = v("pa-admin", "admin", "pa-admin@lumni.invalid");
const S1 = v("pa-s1", "student", "pa-s1@lumni.invalid");
const S2 = v("pa-s2", "student", "pa-s2@lumni.invalid");
const S3 = v("pa-s3", "student", "pa-s3@lumni.invalid");
const ALL = [A, S1, S2, S3];
const refused = async (f: () => Promise<unknown>) => { try { await f(); return null; } catch (e) { return e instanceof UserFacingError ? e.message : `unexpected: ${e}`; } };
const tier = async (x: Viewer) => (await proStatus(x.userId, x.role)).tier;

async function cleanup() {
  await db.delete(schoolLicenses).where(inArray(schoolLicenses.orgName, ["Test High School", "Tiny Pilot Academy"]));
  await db.delete(schoolLeads).where(eq(schoolLeads.email, "counselor@lumni.invalid"));
  await db.delete(users).where(inArray(users.email, ALL.map((x) => x.email)));
}

async function main() {
  console.log("\nFree access\n");
  await cleanup();
  await db.insert(users).values(ALL.map((x) => ({ id: x.userId, name: x.name, email: x.email, role: x.role })));

  check("too short a note is refused", (await refused(() => requestFreeAccess(S1, { message: "pls" })))?.includes("a sentence or two") ?? false);
  const r1 = await requestFreeAccess(S1, { message: "My family can't afford a subscription right now.", schoolName: "Lincoln High" });
  check("a request is recorded as pending", r1.status === "pending");
  check("a second while one is pending is refused", (await refused(() => requestFreeAccess(S1, { message: "Asking again, sorry about that." })))?.includes("already with us") ?? false);

  const [req] = (await db.select().from(freeAccessRequests).where(eq(freeAccessRequests.userId, S1.userId)));
  await decideFreeAccess(A.userId, req.id, { approve: true });
  const st = await proStatus(S1.userId, "student");
  const months = st.tier === "pro" && st.endsAt ? Math.round((st.endsAt.getTime() - Date.now()) / (30.4 * 86_400_000)) : 0;
  check("approving gives about 12 months of Pro, from free access", st.tier === "pro" && st.source === "free_access" && months === 12, `months ${months}`);
  check("deciding twice is refused", (await refused(() => decideFreeAccess(A.userId, req.id, { approve: false })))?.includes("already been decided") ?? false);
  check("someone with Pro can't ask", (await refused(() => requestFreeAccess(S1, { message: "Another request from me here." })))?.includes("already have Pro") ?? false);

  await requestFreeAccess(S2, { message: "We're a single-income family this year." });
  const [req2] = (await db.select().from(freeAccessRequests).where(eq(freeAccessRequests.userId, S2.userId)));
  await decideFreeAccess(A.userId, req2.id, { approve: false, note: "Ask your school counselor about a code." });
  check("declining leaves them Free and shows the note", (await tier(S2)) === "free" && (await myFreeAccessRequest(S2))?.decisionNote === "Ask your school counselor about a code.");

  console.log("\nSchool licenses");
  const ends = new Date(Date.now() + 200 * 86_400_000).toISOString().slice(0, 10);
  const { id, code } = await createSchoolLicense(A.userId, { orgName: "Test High School", seats: 2, endsAt: ends });
  check("a license gets a readable code", /^TEST-[2-9A-HJKMNP-Z]{4}$/.test(code), code);
  const joined = await redeemSchoolCode(S2, code.toLowerCase());
  check("entering it gives Pro until the license ends", (await tier(S2)) === "pro" && joined.orgName === "Test High School");
  check("the same student can't take a second seat", (await refused(() => redeemSchoolCode(S2, code)))?.includes("already using a seat") ?? false);
  await redeemSchoolCode(S3, code);
  const { code: tiny } = await createSchoolLicense(A.userId, { orgName: "Tiny Pilot Academy", seats: 1, endsAt: ends });
  await redeemSchoolCode(S3, tiny);
  check("a full license is refused", (await refused(() => redeemSchoolCode(S2, tiny)))?.includes("seats are all in use") ?? false);
  check("a made-up code is refused", (await refused(() => redeemSchoolCode(S2, "NOPE-2222")))?.includes("isn't active") ?? false);
  const ended = await revokeSchoolLicense(A.userId, id);
  check("ending the license ends its students' Pro", ended === 2 && (await tier(S2)) === "free");
  check("…but not Pro from another license", (await tier(S3)) === "pro");
  check("an ended code can't be used", (await refused(() => redeemSchoolCode(S1, code)))?.includes("isn't active") ?? false);

  console.log("\nInquiries");
  check("a bad email is refused", (await refused(() => createSchoolLead({ schoolName: "X", contactName: "Y", email: "nope" }, "site")))?.includes("email") ?? false);
  await createSchoolLead({ schoolName: "Lincoln High", contactName: "Ms. Rivera", role: "School counselor", email: "counselor@lumni.invalid", students: 320 }, "site");
  const [lead] = await db.select().from(schoolLeads).where(eq(schoolLeads.email, "counselor@lumni.invalid"));
  check("an inquiry is saved as new", lead?.status === "new" && lead.students === 320 && lead.source === "site");

  await cleanup();
  console.log(failures === 0 ? "\nAll checks passed.\n" : `\n${failures} failed.\n`);
  process.exit(failures === 0 ? 0 : 1);
}
main().catch(async (e) => { console.error(e); await cleanup().catch(() => {}); process.exit(1); });
