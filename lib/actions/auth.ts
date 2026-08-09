/* ————————————————————————————————————————
   Auth server actions.

   Signup goes through here rather than straight to Better Auth's endpoint so
   the role is written in trusted server code. The `role` field is
   input:false in lib/auth.ts, which means Better Auth's /update-user cannot
   change it — without that, any signed-in user could flip their own role and
   move themselves across the privacy boundary.

   Two invariants this file holds:

   1. An account never exists without a consent record. Signup is a single
      logical unit — if the role write or the consent write fails after the
      user row is created, the user row is removed rather than left behind as
      an account nobody agreed to terms for.

   2. Every failure returns a non-empty, human-readable message. An earlier
      version returned the raw error text, which for a refused database
      connection is the empty string — the form then rendered nothing at all
      and looked like it had silently done nothing.
   ———————————————————————————————————————— */

"use server";

import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { recordRequiredConsents } from "@/lib/db/queries/consent";
import { MINIMUM_AGE } from "@/lib/legal";
import { SELF_ASSIGNABLE_ROLES, type SelfAssignableRole } from "@/lib/types";

/** Never widen this to include "admin". See SELF_ASSIGNABLE_ROLES. */
const ROLES: readonly SelfAssignableRole[] = SELF_ASSIGNABLE_ROLES;

export type SignUpResult = { ok: true } | { ok: false; error: string };

/**
 * Turn any thrown value into something a person can act on.
 *
 * Infrastructure errors get a plain-language equivalent: a student seeing
 * "ECONNREFUSED" learns nothing, and an empty message teaches them less.
 */
function friendlyError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err ?? "");
  const code = (err as { code?: string } | null)?.code ?? "";

  // Postgres unreachable — usually the local DB is down, or the deploy lost it.
  if (code === "ECONNREFUSED" || code === "ENOTFOUND" || code === "ETIMEDOUT") {
    return "We couldn't reach the database. If you're running locally, start it with `npm run db:up`.";
  }
  if (/connect|timeout|terminated/i.test(raw) && !/password|credential/i.test(raw)) {
    return "We couldn't reach the database just now. Try again in a moment.";
  }
  // Don't leak whether an address is already registered.
  if (/exist|unique|duplicate/i.test(raw)) {
    return "That email can't be used. Try signing in instead.";
  }
  if (/password/i.test(raw)) {
    return raw;
  }
  // Never return "" — an empty message renders as no message at all.
  return raw.trim() || "Something went wrong creating the account. Please try again.";
}

export async function signUpWithRole(input: {
  email: string;
  password: string;
  name: string;
  role: string;
  acceptedTerms: boolean;
  meetsAgeRequirement: boolean;
}): Promise<SignUpResult> {
  const email = input.email.trim().toLowerCase();
  const name = input.name.trim();

  if (!email || !name) return { ok: false, error: "Name and email are required." };
  if (input.password.length < 10) {
    return { ok: false, error: "Password must be at least 10 characters." };
  }

  // Checked server-side as well as in the form. A checkbox the client can
  // simply not send is not a record of agreement.
  if (!input.acceptedTerms) {
    return {
      ok: false,
      error: "Please accept the Terms of Service and Privacy Policy to continue.",
    };
  }
  if (!input.meetsAgeRequirement) {
    return { ok: false, error: `You must be at least ${MINIMUM_AGE} to create an account.` };
  }

  // Never trust the wire value — narrow to the two roles that exist.
  if (!ROLES.includes(input.role as SelfAssignableRole)) {
    return { ok: false, error: "Choose whether you're a student or a parent." };
  }
  const role = input.role as SelfAssignableRole;

  let createdUserId: string | null = null;

  try {
    const requestHeaders = await headers();

    const result = await auth.api.signUpEmail({
      body: { email, password: input.password, name },
      headers: requestHeaders,
    });
    createdUserId = result.user.id;

    // Better Auth won't accept `role` (input:false), so set it here, in code
    // the client cannot reach except through this validated action.
    await db.update(users).set({ role, updatedAt: new Date() }).where(eq(users.id, result.user.id));

    // Must succeed. See invariant 1 at the top of this file.
    await recordRequiredConsents(result.user.id, requestHeaders);

    return { ok: true };
  } catch (err) {
    // Roll back a half-made account so it can't exist without consent on file.
    if (createdUserId) {
      try {
        await db.delete(users).where(eq(users.id, createdUserId));
      } catch (cleanupErr) {
        console.error("[signup] could not roll back partial account:", cleanupErr);
      }
    }
    console.error("[signup] failed:", err);
    return { ok: false, error: friendlyError(err) };
  }
}
