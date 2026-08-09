/* ————————————————————————————————————————
   Legal consent + cost accounting integration test.

   Exercises the two things added alongside the legal documents, against
   the real database:

     1. Consent is recorded, versioned, and idempotent — and an account
        cannot be created without it.
     2. The admin cost queries run and attribute spend and storage to the
        right user, without reading any student content.

   Run:  npx tsx scripts/test-legal.ts
   ———————————————————————————————————————— */

import "./_env";

import { eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { aiUsage, legalConsents, users } from "@/lib/db/schema";
import { outstandingConsents, recordRequiredConsents } from "@/lib/db/queries/consent";
import { totalsFrom, userCosts } from "@/lib/db/queries/admin";
import { signUpWithRole } from "@/lib/actions/auth";
import { PRIVACY_VERSION, REQUIRED_CONSENTS, TERMS_VERSION } from "@/lib/legal";

let failures = 0;

function check(label: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`  ✓ ${label}`);
  } else {
    failures++;
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

const TEST_EMAIL = "consent-test@northstar.invalid";

async function cleanup() {
  await db.delete(users).where(inArray(users.email, [TEST_EMAIL]));
}

async function main() {
  console.log("\nLegal consent + cost accounting\n");
  await cleanup();

  /* ————— 1. Signup refuses without consent ————— */
  console.log("Signup gate");

  const noConsent = await signUpWithRole({
    email: TEST_EMAIL,
    password: "correct-horse-battery",
    name: "Consent Test",
    role: "student",
    acceptedTerms: false,
    meetsAgeRequirement: true,
  });
  check("signup rejected when the box is unchecked", noConsent.ok === false);
  check(
    "rejection explains itself",
    noConsent.ok === false && noConsent.error.length > 0,
    "an empty error renders as no error at all",
  );

  const [leaked] = await db.select().from(users).where(eq(users.email, TEST_EMAIL)).limit(1);
  check("no account was created by the refused signup", !leaked);

  const underage = await signUpWithRole({
    email: TEST_EMAIL,
    password: "correct-horse-battery",
    name: "Consent Test",
    role: "student",
    acceptedTerms: true,
    meetsAgeRequirement: false,
  });
  check("signup rejected below the minimum age", underage.ok === false);

  /* ————— 2. Consent records ————— */
  console.log("\nConsent records");

  // A user created directly, standing in for one that signup made.
  const userId = `test-consent-${Date.now()}`;
  await db.insert(users).values({
    id: userId,
    name: "Consent Test",
    email: TEST_EMAIL,
    role: "student",
  });

  const headers = new Headers({
    "x-forwarded-for": "203.0.113.9, 70.41.3.18",
    "user-agent": "test-runner/1.0",
  });
  await recordRequiredConsents(userId, headers);

  const rows = await db.select().from(legalConsents).where(eq(legalConsents.userId, userId));
  check("one row per required document", rows.length === REQUIRED_CONSENTS.length,
    `got ${rows.length}`);
  check(
    "terms recorded at the current version",
    rows.some((r) => r.document === "terms" && r.version === TERMS_VERSION),
  );
  check(
    "privacy recorded at the current version",
    rows.some((r) => r.document === "privacy" && r.version === PRIVACY_VERSION),
  );
  check(
    "client address taken from the front of the forwarded chain",
    rows[0]?.ipAddress === "203.0.113.9",
    `got ${rows[0]?.ipAddress}`,
  );
  check("user agent captured", rows[0]?.userAgent === "test-runner/1.0");

  // Re-accepting the same version must not duplicate or throw.
  await recordRequiredConsents(userId, headers);
  const afterRepeat = await db
    .select()
    .from(legalConsents)
    .where(eq(legalConsents.userId, userId));
  check("re-accepting the same version is idempotent", afterRepeat.length === rows.length,
    `grew to ${afterRepeat.length}`);

  const outstanding = await outstandingConsents(userId);
  check("nothing outstanding once both are accepted", outstanding.length === 0,
    JSON.stringify(outstanding));

  /* ————— 3. Cost attribution ————— */
  console.log("\nCost accounting");

  await db.insert(aiUsage).values({
    userId,
    feature: "chat",
    model: "claude-opus-5",
    inputTokens: 10_000,
    outputTokens: 2_000,
    // $0.05 in + $0.05 out = $0.10 = 10,000 millicents.
    costMillicents: 10_000,
  });

  const costs = await userCosts();
  const mine = costs.find((c) => c.userId === userId);
  check("the test user appears in the cost roster", !!mine);
  check("AI spend attributed to the right user", mine?.aiMillicents === 10_000,
    `got ${mine?.aiMillicents}`);
  check("tokens attributed", mine?.inputTokens === 10_000 && mine?.outputTokens === 2_000);
  check("storage measured for their rows", (mine?.storageBytes ?? 0) > 0,
    `got ${mine?.storageBytes} bytes`);
  check(
    "monthly total includes storage on top of AI",
    (mine?.monthlyMillicents ?? 0) >= (mine?.aiMillicents30d ?? 0),
  );

  const totals = totalsFrom(costs);
  check("totals include this spend", totals.aiMillicents >= 10_000);
  check("totals count every account", totals.users === costs.length);

  // The boundary: cost rows carry no content.
  const costKeys = Object.keys(mine ?? {});
  const contentish = costKeys.filter((k) => /essay|message|text|content|dob|score/i.test(k));
  check("no content-bearing field on a cost row", contentish.length === 0,
    contentish.join(", "));

  await cleanup();

  console.log(
    failures === 0
      ? "\nAll checks passed.\n"
      : `\n${failures} check${failures === 1 ? "" : "s"} failed.\n`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error(err);
  await cleanup().catch(() => {});
  process.exit(1);
});
