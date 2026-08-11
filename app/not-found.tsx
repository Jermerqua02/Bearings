/* ————————————————————————————————————————
   404 for anything outside the signed-in shell.

   The root layout supplies only <html>/<body> and the provider, so this
   brings its own chrome — same wordmark header as sign-up and onboarding.

   Next's built-in fallback is an unstyled "This page could not be found",
   which lands like a crash in the middle of an otherwise careful product.
   ———————————————————————————————————————— */

import Link from "next/link";
import TwoTone from "@/components/ui/TwoTone";
import SectionLabel from "@/components/ui/SectionLabel";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-paper flex flex-col">
      <header className="border-b border-hairline">
        <div className="max-w-6xl mx-auto px-5 md:px-6 h-16 flex items-center">
          <Link href="/" className="text-[1.05rem] font-semibold tracking-tight">
            Bearings
          </Link>
        </div>
      </header>

      <main className="flex-1 max-w-6xl w-full mx-auto px-5 md:px-6 py-16 md:py-24">
        <SectionLabel className="mb-3">Page not found</SectionLabel>
        <TwoTone as="h1" size="lg" className="max-w-2xl">
          <em>That page isn&apos;t here.</em> The rest of it still is.
        </TwoTone>
        <p className="body-copy mt-6 max-w-xl">
          The link may be old, or it may have been mistyped. Nothing is wrong
          with your account.
        </p>
        <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-[0.9rem]">
          <Link href="/" className="text-ink underline underline-offset-4">
            Back to the start
          </Link>
          <Link href="/dashboard" className="text-ink underline underline-offset-4">
            Go to your dashboard
          </Link>
        </div>
      </main>
    </div>
  );
}
