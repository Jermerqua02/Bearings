"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import Button from "@/components/ui/Button";
import SectionLabel from "@/components/ui/SectionLabel";
import TwoTone from "@/components/ui/TwoTone";
import { resetPassword } from "@/lib/auth-client";

const MIN_LENGTH = 10;

export default function ResetPasswordForm() {
  const router = useRouter();
  const params = useSearchParams();
  // Better Auth appends the token; an error lands here as ?error=... instead.
  const token = params.get("token");
  const linkError = params.get("error");

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;

    if (password.length < MIN_LENGTH) {
      setError(`Password must be at least ${MIN_LENGTH} characters.`);
      return;
    }
    if (password !== confirm) {
      setError("Those two passwords don't match.");
      return;
    }
    if (!token) {
      setError("This link is missing its token. Request a new one.");
      return;
    }

    setBusy(true);
    setError(null);
    let leaving = false;
    try {
      const { error: err } = await resetPassword({ newPassword: password, token });
      if (err) {
        setError(
          err.message ||
            "That link didn't work. It may have expired or already been used.",
        );
        return;
      }
      leaving = true;
      router.push("/sign-in?reset=1");
    } catch (err) {
      console.error("[reset-password] failed:", err);
      setError("We couldn't reach the server. Try again in a moment.");
    } finally {
      if (!leaving) setBusy(false);
    }
  }

  const badLink = !token || linkError;

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
            <em>Choose</em> a new password.
          </TwoTone>

          {badLink ? (
            <>
              <p className="text-[1rem] leading-relaxed mb-6 border-l-2 border-ink pl-4">
                This link has expired or has already been used. Reset links are
                good for one hour and one use.
              </p>
              <Link
                href="/forgot-password"
                className="text-[0.95rem] text-ink underline underline-offset-4"
              >
                Send me a new one
              </Link>
            </>
          ) : (
            <form onSubmit={onSubmit} className="flex flex-col gap-4">
              <label className="flex flex-col gap-2">
                <span className="text-[0.85rem] text-gray-strong">New password</span>
                <input
                  type="password"
                  required
                  autoFocus
                  minLength={MIN_LENGTH}
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="px-4 py-3 border border-hairline rounded-lg bg-surface text-[0.95rem] focus:outline-none focus:border-ink transition-quiet"
                />
                <span className="text-[0.8rem] text-gray-mid">
                  At least {MIN_LENGTH} characters.
                </span>
              </label>

              <label className="flex flex-col gap-2">
                <span className="text-[0.85rem] text-gray-strong">Confirm it</span>
                <input
                  type="password"
                  required
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className="px-4 py-3 border border-hairline rounded-lg bg-surface text-[0.95rem] focus:outline-none focus:border-ink transition-quiet"
                />
              </label>

              {error && (
                <p role="alert" className="text-[0.9rem] text-gray-strong border-l-2 border-ink pl-3">
                  {error}
                </p>
              )}

              <Button type="submit" variant="primary" size="lg" disabled={busy}>
                {busy ? "Saving…" : "Save and sign in"}
              </Button>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}
