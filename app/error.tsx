"use client";

/* ————————————————————————————————————————
   Unhandled render errors.

   Deliberately says nothing about what broke. The error object reaching a
   browser can carry a stack or a failing query, and this product's users are
   mostly minors who can do nothing with either. `digest` is the server-side
   correlation id — that's the thing worth showing, because it's what makes a
   support conversation possible.
   ———————————————————————————————————————— */

import { useEffect } from "react";
import Link from "next/link";
import TwoTone from "@/components/ui/TwoTone";
import SectionLabel from "@/components/ui/SectionLabel";
import Button from "@/components/ui/Button";
import Wordmark from "@/components/Wordmark";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[render]", error);
  }, [error]);

  return (
    <div className="min-h-screen bg-paper flex flex-col">
      <header className="border-b border-hairline">
        <div className="max-w-6xl mx-auto px-5 md:px-6 h-16 flex items-center">
          <Link href="/">
            <Wordmark />
          </Link>
        </div>
      </header>

      <main className="flex-1 max-w-6xl w-full mx-auto px-5 md:px-6 py-16 md:py-24">
        <SectionLabel className="mb-3">Something broke</SectionLabel>
        <TwoTone as="h1" size="lg" className="max-w-2xl">
          <em>That&apos;s on us,</em> not on anything you did.
        </TwoTone>
        <p className="body-copy mt-6 max-w-xl">
          Your work is saved. Try again — and if it keeps happening, the code
          below tells us exactly where to look.
        </p>
        {error.digest && (
          <p className="mt-4 text-[0.8rem] text-gray-mid font-mono">{error.digest}</p>
        )}
        <div className="mt-8 flex flex-wrap items-center gap-4">
          <Button variant="primary" size="lg" onClick={reset}>
            Try again
          </Button>
          <Link href="/dashboard" className="text-[0.9rem] text-ink underline underline-offset-4">
            Go to your dashboard
          </Link>
        </div>
      </main>
    </div>
  );
}
