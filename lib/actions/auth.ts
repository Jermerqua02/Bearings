/* ————————————————————————————————————————
   Auth server actions.

   Signup goes through here rather than straight to Better Auth's endpoint so
   the role is written in trusted server code. The `role` field is
   input:false in lib/auth.ts, which means Better Auth's /update-user cannot
   change it — without that, any signed-in user could flip their own role and
   move themselves across the privacy boundary.
   ———————————————————————————————————————— */

"use server";

import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import type { Role } from "@/lib/types";

const ROLES: readonly Role[] = ["student", "parent"];

export type SignUpResult = { ok: true } | { ok: false; error: string };

export async function signUpWithRole(input: {
  email: string;
  password: string;
  name: string;
  role: string;
}): Promise<SignUpResult> {
  const email = input.email.trim().toLowerCase();
  const name = input.name.trim();

  if (!email || !name) return { ok: false, error: "Name and email are required." };
  if (input.password.length < 10) {
    return { ok: false, error: "Password must be at least 10 characters." };
  }

  // Never trust the wire value — narrow to the two roles that exist.
  if (!ROLES.includes(input.role as Role)) {
    return { ok: false, error: "Choose whether you're a student or a parent." };
  }
  const role = input.role as Role;

  try {
    const result = await auth.api.signUpEmail({
      body: { email, password: input.password, name },
      headers: await headers(),
    });

    // Better Auth won't accept `role` (input:false), so set it here, in code
    // the client cannot reach except through this validated action.
    await db.update(users).set({ role, updatedAt: new Date() }).where(eq(users.id, result.user.id));

    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not create the account.";
    // Don't leak whether an address is already registered.
    if (/exist|unique|duplicate/i.test(message)) {
      return { ok: false, error: "That email can't be used. Try signing in instead." };
    }
    return { ok: false, error: message };
  }
}
