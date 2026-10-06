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
    /*
      Everyone lands on their dashboard, admins included.

      Admins used to be sent to /admin, and the effect was alarming rather
      than convenient: an operator who also uses the product as a student —
      which is every admin on this deployment — signed back in and was shown
      a page of platform metrics with none of their own list, coursework, or
      essays on it. The reasonable conclusion from that screen is that the
      account had been wiped, and the data was in fact untouched the whole
      time. The admin portal is one click away in the account menu, which is
      the right weight for a surface you visit deliberately.
    */
    redirect(safe ?? "/dashboard");
  }

  return (
    <Suspense fallback={<div className="min-h-screen bg-paper" />}>
      <SignInForm />
    </Suspense>
  );
}
