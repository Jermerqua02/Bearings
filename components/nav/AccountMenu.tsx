"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signOut } from "@/lib/auth-client";
import type { Role } from "@/lib/types";

/* The account menu.

   Northstar had no sign-out control anywhere. `signOut` was exported from
   lib/auth-client.ts and called by nothing, the avatar in the header was a
   decorative circle, and mobile had no header at all — which also left
   Settings unreachable on a phone, since it lives in the secondary nav the
   mobile tab bar doesn't render.

   Admins get their portal link here too. It was previously reachable only
   by typing the URL. */

export default function AccountMenu({
  name,
  email,
  role,
  initial,
}: {
  name: string;
  email: string;
  role: Role;
  initial: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click and on Escape — a menu that traps you is worse
  // than no menu.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function onSignOut() {
    setBusy(true);
    try {
      await signOut();
    } catch (err) {
      // Even if the network call fails, get them off the authenticated
      // shell — a sign-out button that appears to do nothing is worse than
      // one that over-delivers.
      console.error("[sign-out] failed:", err);
    }
    // Full reload rather than router.push: it drops every cached RSC payload
    // rendered for the signed-in user.
    window.location.href = "/";
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        className="w-8 h-8 rounded-full bg-fill border border-hairline flex items-center justify-center text-[0.8rem] font-medium hover:border-ink transition-quiet"
      >
        {initial}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-2 w-60 rounded-lg border border-hairline bg-surface shadow-lg overflow-hidden z-50"
        >
          <div className="px-4 py-3 border-b border-hairline">
            <p className="text-[0.9rem] font-medium truncate">{name}</p>
            <p className="text-[0.8rem] text-gray-mid truncate">{email}</p>
            {role === "admin" && (
              <span className="inline-block mt-2 text-[0.7rem] tracking-[0.08em] uppercase border border-ink rounded px-1.5 py-0.5">
                Admin
              </span>
            )}
          </div>

          <div className="py-1">
            {role === "admin" && (
              <Link
                href="/admin"
                role="menuitem"
                onClick={() => setOpen(false)}
                className="block px-4 py-2.5 text-[0.9rem] hover:bg-fill transition-quiet"
              >
                Admin portal
              </Link>
            )}
            <Link
              href="/settings"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="block px-4 py-2.5 text-[0.9rem] hover:bg-fill transition-quiet"
            >
              Settings
            </Link>
          </div>

          <div className="border-t border-hairline py-1">
            <button
              type="button"
              role="menuitem"
              onClick={onSignOut}
              disabled={busy}
              className="w-full text-left px-4 py-2.5 text-[0.9rem] hover:bg-fill transition-quiet disabled:opacity-60"
            >
              {busy ? "Signing out…" : "Sign out"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
