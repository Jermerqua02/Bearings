import { redirect } from "next/navigation";
import { getViewer } from "@/lib/auth/policy";

/* Onboarding shell.

   The real guard. Middleware sees only the session cookie and can be
   satisfied by a stale or forged one; this reads the verified session.

   Onboarding was previously unprotected at both layers — not listed in
   middleware, no check in the page — so a signed-out visitor could walk the
   entire questionnaire and only discover at the last step that there was no
   account to save it against. Worse, if a session did exist from an earlier
   sign-in, the answers were written to *that* account. */

export default async function OnboardingLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const viewer = await getViewer();
  if (!viewer) redirect("/sign-up");

  // Admins are deliberately allowed through. An earlier version bounced
  // them to /admin on the theory that an operator has no profile of their
  // own to build — which turns out to block the one person most likely to
  // walk this flow: the owner, testing their own product. Admin is a set of
  // extra powers, not a different kind of account.

  return <>{children}</>;
}
