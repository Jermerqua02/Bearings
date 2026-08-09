"use client";

import { useState } from "react";
import Link from "next/link";
import Button from "@/components/ui/Button";
import SectionLabel from "@/components/ui/SectionLabel";
import TwoTone from "@/components/ui/TwoTone";
import { requestPasswordReset } from "@/lib/auth-client";

/* Request a password reset.

   The response is deliberately identical whether or not the address is
   registered. Saying "no account with that email" turns this form into a
   way to discover who has an account here — and given who our users are,
   that is not a list worth handing out. */

export default function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await requestPasswordReset({ email, redirectTo: "/reset-password" });
      // Shown regardless of the result, for the reason above.
      setSent(true);
    } catch (err) {
      console.error("[forgot-password] failed:", err);
      setError("We couldn't reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-paper flex flex-col">
      <header className="border-b border-hairline">
        <div className="max-w-6xl mx-auto px-5 md:px-6 h-16 flex items-center">
          <Link href="/" className="text-[1.05rem] font-semibold tracking-tight">
            Northstar
          </Link>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-5 py-16">
        <div className="w-full max-w-md">
          <SectionLabel className="mb-4">Account recovery</SectionLabel>
          <TwoTone as="h1" size="lg" className="mb-8">
            <em>Reset</em> your password.
          </TwoTone>

          {sent ? (
            <>
              <p className="text-[1rem] leading-relaxed mb-6 border-l-2 border-ink pl-4">
                If there&apos;s an account for <strong>{email}</strong>, a reset link
                is on its way. It expires in an hour.
              </p>
              <p className="text-[0.9rem] text-gray-mid leading-relaxed mb-8">
                Nothing arriving? Check spam, and make sure that&apos;s the address
                you signed up with.
              </p>
              <Link href="/sign-in" className="text-[0.95rem] text-ink underline underline-offset-4">
                Back to sign in
              </Link>
            </>
          ) : (
            <>
              <p className="text-[0.95rem] text-gray-mid leading-relaxed mb-8">
                Enter your email and we&apos;ll send you a link to set a new one.
              </p>
              <form onSubmit={onSubmit} className="flex flex-col gap-4">
                <label className="flex flex-col gap-2">
                  <span className="text-[0.85rem] text-gray-strong">Email</span>
                  <input
                    type="email"
                    required
                    autoFocus
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="px-4 py-3 border border-hairline rounded-lg bg-surface text-[0.95rem] focus:outline-none focus:border-ink transition-quiet"
                  />
                </label>

                {error && (
                  <p role="alert" className="text-[0.9rem] text-gray-strong border-l-2 border-ink pl-3">
                    {error}
                  </p>
                )}

                <Button type="submit" variant="primary" size="lg" disabled={busy}>
                  {busy ? "Sending…" : "Send the link"}
                </Button>
              </form>

              <p className="mt-8 text-[0.9rem] text-gray-mid">
                Remembered it?{" "}
                <Link href="/sign-in" className="text-ink underline underline-offset-4">
                  Sign in
                </Link>
              </p>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
