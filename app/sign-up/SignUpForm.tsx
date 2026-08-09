"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import Button from "@/components/ui/Button";
import SectionLabel from "@/components/ui/SectionLabel";
import TwoTone from "@/components/ui/TwoTone";
import { signUpWithRole } from "@/lib/actions/auth";
import { signIn } from "@/lib/auth-client";
import { MINIMUM_AGE } from "@/lib/legal";
import type { Role } from "@/lib/types";

/* The signup form.

   On error handling: every await below is inside the try, and `busy` is
   cleared in `finally` unless we are deliberately navigating away. Without
   that, a server action that *threw* — rather than returning ok:false —
   rejected the promise, left `busy` stuck at true, and the button read
   "Creating account…" forever with nothing explaining why. A database that
   was simply down looked identical to a hung page. */

export default function SignUpForm() {
  const router = useRouter();
  const params = useSearchParams();
  const initialRole = params.get("role") === "parent" ? "parent" : "student";

  const [role, setRole] = useState<Role>(initialRole);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;

    setBusy(true);
    setError(null);

    // Set only on the paths that navigate, so `finally` knows to leave the
    // button in its working state while the next page loads.
    let leaving = false;

    try {
      const result = await signUpWithRole({
        email,
        password,
        name,
        role,
        acceptedTerms: accepted,
        // One checkbox covers both; the server records them separately.
        meetsAgeRequirement: accepted,
      });

      if (!result.ok) {
        // Guard against an empty message rendering as no message at all.
        setError(result.error || "Something went wrong. Please try again.");
        return;
      }

      const { error: signInErr } = await signIn.email({ email, password });
      leaving = true;
      if (signInErr) {
        // The account exists; only the automatic sign-in failed.
        router.push("/sign-in?created=1");
        return;
      }
      router.push(`/onboarding?role=${role}`);
      router.refresh();
    } catch (err) {
      console.error("[sign-up] unexpected failure:", err);
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
          <SectionLabel className="mb-4">Fifteen minutes to start</SectionLabel>
          <TwoTone as="h1" size="lg" className="mb-8">
            <em>Create your account.</em>
          </TwoTone>

          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            <fieldset className="flex flex-col gap-2">
              <legend className="text-[0.85rem] text-gray-strong mb-2">I&apos;m a…</legend>
              <div className="grid grid-cols-2 gap-2">
                {(["student", "parent"] as const).map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRole(r)}
                    aria-pressed={role === r}
                    className={`px-4 py-3 rounded-lg border text-[0.95rem] transition-quiet ${
                      role === r
                        ? "border-ink bg-ink text-paper"
                        : "border-hairline bg-surface hover:border-ink"
                    }`}
                  >
                    {r === "student" ? "Student" : "Parent"}
                  </button>
                ))}
              </div>
            </fieldset>

            <label className="flex flex-col gap-2">
              <span className="text-[0.85rem] text-gray-strong">First name</span>
              <input
                required
                autoComplete="given-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="px-4 py-3 border border-hairline rounded-lg bg-surface text-[0.95rem] focus:outline-none focus:border-ink transition-quiet"
              />
            </label>

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
                minLength={10}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="px-4 py-3 border border-hairline rounded-lg bg-surface text-[0.95rem] focus:outline-none focus:border-ink transition-quiet"
              />
              <span className="text-[0.8rem] text-gray-mid">At least 10 characters.</span>
            </label>

            <label className="flex gap-3 items-start pt-1 cursor-pointer">
              <input
                type="checkbox"
                required
                checked={accepted}
                onChange={(e) => setAccepted(e.target.checked)}
                className="mt-1 h-4 w-4 shrink-0 accent-ink cursor-pointer"
              />
              <span className="text-[0.85rem] text-gray-strong leading-relaxed">
                I&apos;m at least {MINIMUM_AGE} years old and I agree to the{" "}
                <Link
                  href="/terms"
                  target="_blank"
                  className="text-ink underline underline-offset-4"
                >
                  Terms of Service
                </Link>{" "}
                and{" "}
                <Link
                  href="/privacy"
                  target="_blank"
                  className="text-ink underline underline-offset-4"
                >
                  Privacy Policy
                </Link>
                . If I&apos;m under 18, a parent or guardian agrees too.
              </span>
            </label>

            {error && (
              <p role="alert" className="text-[0.9rem] text-gray-strong border-l-2 border-ink pl-3">
                {error}
              </p>
            )}

            <Button type="submit" variant="primary" size="lg" disabled={busy || !accepted}>
              {busy ? "Creating account…" : "Create account"}
            </Button>
          </form>

          <p className="mt-6 text-[0.8rem] text-gray-mid leading-relaxed">
            Most of our users are minors. We never sell or share student data — in
            the product, not just the terms.
          </p>

          <p className="mt-6 text-[0.9rem] text-gray-mid">
            Already have an account?{" "}
            <Link href="/sign-in" className="text-ink underline underline-offset-4">
              Sign in
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
