"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import Button from "@/components/ui/Button";
import SectionLabel from "@/components/ui/SectionLabel";
import TwoTone from "@/components/ui/TwoTone";
import { signIn, signOut, useSession } from "@/lib/auth-client";

export default function SignInForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") ?? "/dashboard";
  const justCreated = params.get("created") === "1";
  const justReset = params.get("reset") === "1";

  const { data: session } = useSession();
  const signedInAs = session?.user?.email ?? null;

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);

    let leaving = false;
    try {
      // Sign out any existing session first. Without this, submitting the
      // form while already signed in silently kept the old session and just
      // navigated — which looked like "it goes straight to the dashboard"
      // and made switching accounts impossible.
      if (signedInAs) await signOut().catch(() => {});

      const { error: err } = await signIn.email({ email, password });
      if (err) {
        setError(err.message || "Could not sign in. Check your email and password.");
        return;
      }
      leaving = true;
      router.push(next);
      router.refresh();
    } catch (err) {
      console.error("[sign-in] unexpected failure:", err);
      setError(
        err instanceof Error && err.message
          ? err.message
          : "We couldn't reach the server. Check your connection and try again.",
      );
    } finally {
      if (!leaving) setBusy(false);
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
          <SectionLabel className="mb-4">Welcome back</SectionLabel>
          <TwoTone as="h1" size="lg" className="mb-8">
            <em>Sign in</em> to pick up where you left off.
          </TwoTone>

          {justCreated && (
            <p className="mb-6 text-[0.9rem] text-gray-strong border-l-2 border-ink pl-3">
              Your account was created. Sign in to continue.
            </p>
          )}

          {justReset && (
            <p className="mb-6 text-[0.9rem] text-gray-strong border-l-2 border-ink pl-3">
              Your password has been changed. Sign in with the new one.
            </p>
          )}

          {/* Already signed in. Say so plainly and offer both doors, rather
              than showing a form that appears to do nothing. */}
          {signedInAs && (
            <div className="mb-6 border border-hairline rounded-lg bg-surface p-4">
              <p className="text-[0.9rem] mb-3">
                You&apos;re signed in as{" "}
                <span className="font-medium">{signedInAs}</span>.
              </p>
              <div className="flex flex-wrap gap-3">
                <Link
                  href={next}
                  className="text-[0.9rem] text-ink underline underline-offset-4"
                >
                  Continue to {next === "/admin" ? "admin" : "your dashboard"}
                </Link>
                <button
                  type="button"
                  onClick={async () => {
                    await signOut().catch(() => {});
                    window.location.href = "/sign-in";
                  }}
                  className="text-[0.9rem] text-gray-mid hover:text-ink underline underline-offset-4 transition-quiet"
                >
                  Sign out
                </button>
              </div>
              <p className="text-[0.8rem] text-gray-mid mt-3">
                Or sign in below as someone else.
              </p>
            </div>
          )}

          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            <label className="flex flex-col gap-2">
              <span className="text-[0.85rem] text-gray-strong">Email</span>
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="px-4 py-3 border border-hairline rounded-lg bg-surface text-[0.95rem] focus:outline-none focus:border-ink transition-quiet"
              />
            </label>

            <label className="flex flex-col gap-2">
              <span className="text-[0.85rem] text-gray-strong">Password</span>
              <input
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="px-4 py-3 border border-hairline rounded-lg bg-surface text-[0.95rem] focus:outline-none focus:border-ink transition-quiet"
              />
            </label>

            {error && (
              <p role="alert" className="text-[0.9rem] text-gray-strong border-l-2 border-ink pl-3">
                {error}
              </p>
            )}

            <Button type="submit" variant="primary" size="lg" disabled={busy}>
              {busy ? "Signing in…" : "Sign in"}
            </Button>
          </form>

          <p className="mt-8 text-[0.9rem] text-gray-mid">
            New here?{" "}
            <Link href="/sign-up" className="text-ink underline underline-offset-4">
              Create an account
            </Link>
          </p>
          <p className="mt-3 text-[0.9rem] text-gray-mid">
            <Link
              href="/forgot-password"
              className="text-gray-mid hover:text-ink underline underline-offset-4 transition-quiet"
            >
              Forgot your password?
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
