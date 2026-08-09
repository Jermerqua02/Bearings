"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useApp } from "@/lib/profile-context";
import { gradeModeLabel, type Role } from "@/lib/types";

/* Primary nav — desktop header + mobile bottom tab bar.
   Mobile tabs: Home · Explore · Counselor · List · Apply (per spec).
   Parents see a reduced set: the counselor and interview routes are
   student-private, so the nav must not link to them. */

/** Kept in sync with STUDENT_ONLY_ROUTES in lib/auth/policy.ts. */
const STUDENT_ONLY_HREFS = new Set(["/counselor", "/interviews"]);

const tabs = [
  { href: "/dashboard", label: "Home" },
  { href: "/explore", label: "Explore" },
  { href: "/counselor", label: "Counselor" },
  { href: "/list", label: "List" },
  { href: "/apply", label: "Apply" },
];

const secondary = [
  { href: "/planner", label: "Planner" },
  { href: "/interviews", label: "Interviews" },
  { href: "/decide", label: "Decisions" },
  { href: "/settings", label: "Settings" },
];

function TabIcon({ label, active }: { label: string; active: boolean }) {
  /* Minimal geometric glyphs — quiet, not cartoonish. */
  const stroke = active ? "var(--color-ink)" : "var(--color-gray-mid)";
  const common = {
    width: 22,
    height: 22,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke,
    strokeWidth: 1.5,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  switch (label) {
    case "Home":
      return (
        <svg {...common}>
          <path d="M4 11l8-7 8 7v9a1 1 0 0 1-1 1h-5v-6h-4v6H5a1 1 0 0 1-1-1z" />
        </svg>
      );
    case "Explore":
      return (
        <svg {...common}>
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-4-4" />
        </svg>
      );
    case "Counselor":
      return (
        <svg {...common}>
          <path d="M21 12a8 8 0 0 1-8 8H4l1.5-3A8 8 0 1 1 21 12z" />
        </svg>
      );
    case "List":
      return (
        <svg {...common}>
          <path d="M8 6h12M8 12h12M8 18h12" />
          <path d="M4 6h.01M4 12h.01M4 18h.01" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <rect x="4" y="4" width="16" height="16" rx="1" />
          <path d="M9 12l2 2 4-5" />
        </svg>
      );
  }
}

export default function AppNav({ role, name }: { role: Role; name: string }) {
  const pathname = usePathname();
  const { mode, profile } = useApp();

  const isActive = (href: string) => pathname.startsWith(href);

  // A parent's nav must not advertise routes the boundary denies them. This
  // was identical for both roles before, linking parents straight to the
  // counselor and interview pages.
  const visibleTabs = role === "parent" ? tabs.filter((t) => !STUDENT_ONLY_HREFS.has(t.href)) : tabs;
  const visibleSecondary =
    role === "parent" ? secondary.filter((t) => !STUDENT_ONLY_HREFS.has(t.href)) : secondary;
  const initial = (profile?.firstName ?? name).charAt(0);

  return (
    <>
      {/* Desktop header */}
      <header className="hidden md:block border-b border-hairline bg-paper/95 backdrop-blur sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-10">
            <Link
              href="/dashboard"
              className="text-[1.05rem] font-semibold tracking-tight"
            >
              Northstar
            </Link>
            <nav aria-label="Primary" className="flex items-center gap-6">
              {[...visibleTabs.slice(1), ...visibleSecondary].map((t) => (
                <Link
                  key={t.href}
                  href={t.href}
                  aria-current={isActive(t.href) ? "page" : undefined}
                  className={`text-[0.9rem] transition-quiet ${
                    isActive(t.href)
                      ? "text-ink"
                      : "text-gray-mid hover:text-ink"
                  }`}
                >
                  {t.label}
                </Link>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-4">
            {/* Grade-aware mode — a quiet label, not a badge */}
            <span className="label-caps" title="Your current mode">
              {gradeModeLabel[mode]} mode
            </span>
            <span className="w-8 h-8 rounded-full bg-fill border border-hairline flex items-center justify-center text-[0.8rem] font-medium">
              {initial}
            </span>
          </div>
        </div>
      </header>

      {/* Mobile bottom tab bar */}
      <nav
        aria-label="Primary"
        className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-paper/95 backdrop-blur border-t border-hairline"
      >
        <div className="grid grid-cols-5">
          {visibleTabs.map((t) => {
            const active = isActive(t.href);
            return (
              <Link
                key={t.href}
                href={t.href}
                aria-current={active ? "page" : undefined}
                className="flex flex-col items-center justify-center gap-0.5 py-2 min-h-[52px]"
              >
                <TabIcon label={t.label} active={active} />
                <span
                  className={`text-[0.62rem] tracking-[0.04em] ${
                    active ? "text-ink font-medium" : "text-gray-mid"
                  }`}
                >
                  {t.label}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
