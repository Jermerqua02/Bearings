import { Suspense } from "react";
import { redirect } from "next/navigation";
import SignInForm from "./SignInForm";
import { getViewer } from "@/lib/auth/policy";

/* Sign in.

   Already signed in? Go straight through. Showing a signed-in visitor a
   "You're signed in as… continue to your dashboard" panel makes them read
   and click to reach somewhere they had already asked to be. The form only
   has a job when there is no session; switching accounts happens through
   Sign out in the account menu, which is where people look for it anyway. */

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const params = await searchParams;
  const viewer = await getViewer();

  if (viewer) {
    // Only ever redirect within this app. An unchecked `next` is an open
    // redirect — "//evil.com" is protocol-relative and leaves the site.
    const requested = params.next;
    const safe =
      requested && requested.startsWith("/") && !requested.startsWith("//")
        ? requested
        : null;
    redirect(safe ?? (viewer.role === "admin" ? "/admin" : "/dashboard"));
  }

  return (
    <Suspense fallback={<div className="min-h-screen bg-paper" />}>
      <SignInForm />
    </Suspense>
  );
}
