"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import Button from "@/components/ui/Button";
import SectionLabel from "@/components/ui/SectionLabel";
import TwoTone from "@/components/ui/TwoTone";
import { signIn } from "@/lib/auth-client";

export default function SignInForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") ?? "/dashboard";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error: err } = await signIn.email({ email, password });
    if (err) {
      setError(err.message ?? "Could not sign in.");
      setBusy(false);
      return;
    }
    router.push(next);
    router.refresh();
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
        </div>
      </main>
    </div>
  );
}
