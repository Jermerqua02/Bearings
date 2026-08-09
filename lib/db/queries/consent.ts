/* ————————————————————————————————————————
   Recording legal consent.

   Consent is only evidence if it says what was agreed to and when. Every
   acceptance writes one row per document against the version string the
   user actually saw (lib/legal.ts), with the address it came from.

   Writes are idempotent: accepting a version already on file is a no-op,
   so a double-submitted form doesn't error and doesn't duplicate.
   ———————————————————————————————————————— */

import "server-only";

import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { legalConsents } from "@/lib/db/schema";
import { REQUIRED_CONSENTS } from "@/lib/legal";

/** Best-effort client address. Proxies rewrite these; null is acceptable. */
function clientIp(h: Headers): string | null {
  // x-forwarded-for is a comma-separated chain; the first entry is the client.
  const forwarded = h.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim() || null;
  return h.get("x-real-ip") ?? null;
}

/**
 * Write the current Terms and Privacy acceptance for a user.
 *
 * Throws if the write fails. Unlike usage metering — which is allowed to
 * fail quietly because nobody is harmed by a missing cost row — a missing
 * consent row is the difference between having an agreement and not, so a
 * failure here must surface rather than be swallowed.
 */
export async function recordRequiredConsents(userId: string, h: Headers): Promise<void> {
  const ipAddress = clientIp(h);
  const userAgent = h.get("user-agent");

  await db
    .insert(legalConsents)
    .values(
      REQUIRED_CONSENTS.map((c) => ({
        userId,
        document: c.document,
        version: c.version,
        ipAddress,
        userAgent,
      })),
    )
    .onConflictDoNothing();
}

/**
 * Which of the current documents this user has not yet accepted.
 *
 * Empty means they are up to date. Bumping a version in lib/legal.ts makes
 * this non-empty for everyone, which is how a re-acceptance prompt would
 * find the people who owe one.
 */
export async function outstandingConsents(
  userId: string,
): Promise<Array<{ document: string; version: string }>> {
  const rows = await db
    .select({ document: legalConsents.document, version: legalConsents.version })
    .from(legalConsents)
    .where(
      and(
        eq(legalConsents.userId, userId),
        inArray(
          legalConsents.document,
          REQUIRED_CONSENTS.map((c) => c.document),
        ),
      ),
    );

  const accepted = new Set(rows.map((r) => `${r.document}@${r.version}`));
  return REQUIRED_CONSENTS.filter((c) => !accepted.has(`${c.document}@${c.version}`));
}
