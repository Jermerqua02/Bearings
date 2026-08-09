import Link from "next/link";
import { COMPANY, hasUnfilledPlaceholders } from "@/lib/legal";

/* Shell for the public legal documents.

   Deliberately plain: no app chrome, no nav that assumes a session. These
   pages are read by people who don't have an account yet, by parents
   deciding whether to let a kid sign up, and occasionally by a lawyer. */

export default function LegalLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="min-h-screen bg-paper flex flex-col">
      <header className="border-b border-hairline">
        <div className="max-w-3xl mx-auto px-5 md:px-6 h-16 flex items-center justify-between">
          <Link href="/" className="text-[1.05rem] font-semibold tracking-tight">
            Northstar
          </Link>
          <nav className="flex items-center gap-5 text-[0.9rem] text-gray-mid">
            <Link href="/terms" className="hover:text-ink transition-quiet">
              Terms
            </Link>
            <Link href="/privacy" className="hover:text-ink transition-quiet">
              Privacy
            </Link>
          </nav>
        </div>
      </header>

      {/* Loud outside production, invisible in it — so an unfilled address or
          governing-law state can't ship unnoticed. */}
      {process.env.NODE_ENV !== "production" && hasUnfilledPlaceholders() && (
        <div className="border-b border-ink bg-ink text-paper">
          <div className="max-w-3xl mx-auto px-5 md:px-6 py-3 text-[0.85rem]">
            <strong>Unfilled placeholders.</strong> Values marked ⟦ like this ⟧ in
            these documents still need real answers — see the review block in{" "}
            <code>lib/legal.ts</code>. Have counsel review both documents before
            relying on them.
          </div>
        </div>
      )}

      <main className="flex-1 max-w-3xl mx-auto px-5 md:px-6 py-14 w-full">
        {children}
      </main>

      <footer className="border-t border-hairline">
        <div className="max-w-3xl mx-auto px-5 md:px-6 py-8 flex flex-col sm:flex-row gap-3 justify-between text-[0.85rem] text-gray-mid">
          <span>
            {COMPANY.productName} is operated by {COMPANY.legalName}.
          </span>
          <span>{COMPANY.legalEmail}</span>
        </div>
      </footer>
    </div>
  );
}
