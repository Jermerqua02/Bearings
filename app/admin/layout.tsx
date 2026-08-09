import { redirect } from "next/navigation";
import Link from "next/link";
import { getViewer } from "@/lib/auth/policy";

/* Admin shell.

   Guarded here rather than in middleware because middleware runs on the edge
   with only the session cookie, and trusting a role from there would be
   trusting client-supplied data. A non-admin is sent to the dashboard, not
   shown a 403 — there's no reason to confirm the surface exists. */

/* Only routes that exist. The nav previously listed /admin/activity,
   /admin/codes and /admin/audit, none of which had pages — every one was a
   404 for the only person allowed to click it. Add the link back when the
   screen lands, not before. */
const NAV = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/telemetry", label: "Telemetry" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/feedback", label: "Feedback" },
  { href: "/admin/usage", label: "Costs" },
  { href: "/admin/apis", label: "APIs" },
];

export default async function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const viewer = await getViewer();
  if (!viewer) redirect("/sign-in?next=/admin");
  if (viewer.role !== "admin") redirect("/dashboard");

  return (
    <div className="min-h-screen bg-paper">
      <header className="border-b border-hairline bg-surface">
        <div className="max-w-6xl mx-auto px-5 md:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <Link href="/admin" className="text-[1.05rem] font-semibold tracking-tight">
              Northstar <span className="text-gray-mid font-normal">admin</span>
            </Link>
            <nav aria-label="Admin" className="hidden md:flex items-center gap-5">
              {NAV.map((n) => (
                <Link
                  key={n.href}
                  href={n.href}
                  className="text-[0.9rem] text-gray-mid hover:text-ink transition-quiet"
                >
                  {n.label}
                </Link>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-4">
            <span className="hidden sm:inline text-[0.85rem] text-gray-mid">{viewer.email}</span>
            <Link
              href="/dashboard"
              className="text-[0.85rem] text-gray-strong hover:text-ink transition-quiet"
            >
              Exit admin
            </Link>
          </div>
        </div>
        {/* The desktop nav is hidden below md; without this the admin portal
            is a set of pages with no way between them on a phone. */}
        <nav
          aria-label="Admin"
          className="md:hidden border-t border-hairline overflow-x-auto"
        >
          <div className="flex items-center gap-5 px-5 py-2.5 whitespace-nowrap">
            {NAV.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className="text-[0.85rem] text-gray-mid hover:text-ink transition-quiet"
              >
                {n.label}
              </Link>
            ))}
          </div>
        </nav>
      </header>
      <main className="max-w-6xl mx-auto px-5 md:px-6 py-10">{children}</main>
    </div>
  );
}
