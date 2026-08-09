/* ————————————————————————————————————————
   Better Auth — server configuration.

   Self-hosted against our own Postgres: no third party holds a student's
   PII. `role` is an additional field on the user, set at signup and read by
   every authorization check in lib/auth/policy.ts.
   ———————————————————————————————————————— */

import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { nextCookies } from "better-auth/next-js";
import { db } from "@/lib/db";
import { accounts, sessions, users, verifications } from "@/lib/db/schema";

if (!process.env.BETTER_AUTH_SECRET) {
  throw new Error(
    "BETTER_AUTH_SECRET is not set. Copy .env.example to .env.local and generate one with: openssl rand -base64 32",
  );
}

export const auth = betterAuth({
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",

  database: drizzleAdapter(db, {
    provider: "pg",
    // Our exported consts are plural; the tables Better Auth expects are
    // singular. Map explicitly rather than renaming the schema.
    schema: {
      user: users,
      session: sessions,
      account: accounts,
      verification: verifications,
    },
  }),

  emailAndPassword: {
    enabled: true,
    // Email delivery isn't wired yet; turning verification on before it is
    // would lock every new account out.
    requireEmailVerification: false,
    minPasswordLength: 10,
  },

  user: {
    additionalFields: {
      role: {
        type: "string",
        required: true,
        defaultValue: "student",
        // Deliberately NOT client-writable. With input:true, Better Auth
        // accepts `role` on /update-user, letting any signed-in user flip
        // their own role — and the whole privacy boundary branches on it.
        // Signup sets the role server-side in lib/actions/auth.ts instead.
        input: false,
      },
    },
  },

  session: {
    expiresIn: 60 * 60 * 24 * 30, // 30 days
    updateAge: 60 * 60 * 24, // refresh once a day
  },

  advanced: {
    // Most users are minors on shared or school devices — keep cookies tight.
    defaultCookieAttributes: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    },
  },

  // Must be last: lets server actions set auth cookies.
  plugins: [nextCookies()],
});

export type Auth = typeof auth;
export type Session = typeof auth.$Infer.Session;
