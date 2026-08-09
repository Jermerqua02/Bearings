/* ————————————————————————————————————————
   Better Auth — client. Used by the sign-in / sign-up / reset screens.

   No baseURL on purpose. It used to be
   `process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"`, and
   NEXT_PUBLIC_APP_URL is set nowhere — so the production bundle shipped
   with localhost:3000 compiled into it, and a browser on the deployed site
   would send its auth requests to the visitor's own machine. Harmless when
   nothing is listening there; considerably less harmless for anyone running
   the dev server on the same laptop they browse production from.

   Omitting it makes the client use the origin it was served from, which is
   correct in every environment and needs no variable to be right.
   ———————————————————————————————————————— */

"use client";

import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient();

export const {
  signIn,
  signUp,
  signOut,
  useSession,
  requestPasswordReset,
  resetPassword,
} = authClient;
