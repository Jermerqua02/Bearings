/* Rate limit test. Run: npm run test:rate */
import "./_env";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { aiUsage, users } from "@/lib/db/schema";
import { LIMITS, checkRateLimit } from "@/lib/rate-limit";

let failures = 0;
const check = (l: string, ok: boolean, d?: string) => {
  console.log(ok ? `  ✓ ${l}` : `  ✗ ${l}${d ? ` — ${d}` : ""}`);
  if (!ok) failures++;
};

const U = "rate-limit-test-user";
const EMAIL = "rate-limit-test@northstar.invalid";

async function seed(feature: "speech" | "chat", n: number, ageMinutes = 0) {
  const at = new Date(Date.now() - ageMinutes * 60_000);
  if (n === 0) return;
  await db.insert(aiUsage).values(
    Array.from({ length: n }, () => ({
      userId: U, feature, model: "test", inputTokens: 0, outputTokens: 0,
      costMillicents: 1, createdAt: at, updatedAt: at,
    })),
  );
}

async function cleanup() { await db.delete(users).where(inArray(users.email, [EMAIL])); }

async function main() {
  console.log("\nRate limiting\n");
  await cleanup();
  await db.insert(users).values({ id: U, name: "Rate", email: EMAIL, role: "student" });

  const speech = LIMITS.speech!;

  console.log("A fresh account");
  let v = await checkRateLimit(U, "speech");
  check("is allowed", v.allowed);
  check("has used nothing", v.used === 0, `got ${v.used}`);
  check("reports the right ceiling", v.limit === speech.max);

  console.log("\nJust under the limit");
  await seed("speech", speech.max - 1);
  v = await checkRateLimit(U, "speech");
  check("still allowed at max-1", v.allowed, `used ${v.used}`);

  console.log("\nAt the limit");
  await seed("speech", 1);
  v = await checkRateLimit(U, "speech");
  check("blocked once the allowance is spent", !v.allowed, `used ${v.used}`);
  check("tells the caller when to retry", v.retryAfterSeconds > 0);
  check("retry is within the window", v.retryAfterSeconds <= speech.windowMinutes * 60);

  console.log("\nLimits are per feature");
  v = await checkRateLimit(U, "chat");
  check("spending speech doesn't block chat", v.allowed, v.used + " chat calls");

  console.log("\nOlder calls age out of the window");
  await db.delete(aiUsage).where(eq(aiUsage.userId, U));
  await seed("speech", speech.max, speech.windowMinutes + 10);
  v = await checkRateLimit(U, "speech");
  check("a full allowance from before the window doesn't count", v.allowed, `used ${v.used}`);

  console.log("\nAn unknown feature falls back to the default");
  v = await checkRateLimit(U, "greet");
  check("uses the default ceiling", v.limit === LIMITS.default!.max, `got ${v.limit}`);

  await cleanup();
  console.log(failures === 0 ? "\nAll checks passed.\n" : `\n${failures} failed.\n`);
  process.exit(failures === 0 ? 0 : 1);
}
main().catch(async (e) => { console.error(e); await cleanup().catch(()=>{}); process.exit(1); });
