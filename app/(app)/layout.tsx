import { redirect } from "next/navigation";
import AppNav from "@/components/nav/AppNav";
import FeedbackWidget from "@/components/FeedbackWidget";
import { getViewer, isStudentOnlyRoute } from "@/lib/auth/policy";
import { headers } from "next/headers";

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const viewer = await getViewer();
  if (!viewer) redirect("/sign-in");

  // Middleware can't verify the role from the cookie alone; this can. A
  // parent reaching /counselor or /interviews is turned away before the page
  // renders — previously both rendered fully for any role.
  const pathname = (await headers()).get("x-pathname") ?? "";
  if (viewer.role === "parent" && isStudentOnlyRoute(pathname)) {
    redirect("/dashboard");
  }

  return (
    <div className="min-h-screen bg-paper">
      {/* AppNav renders two headers and a bottom tab bar, so a keyboard user
          had to walk the whole navigation on every page before reaching
          anything. Visible only once focused. */}
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:px-4 focus:py-2.5 focus:bg-ink focus:text-white focus:rounded-full focus:text-[0.8rem] focus:font-medium"
      >
        Skip to content
      </a>
      <AppNav role={viewer.role} name={viewer.name} email={viewer.email} />
      {/* pb clears the mobile tab bar */}
      <main
        id="main"
        tabIndex={-1}
        className="max-w-6xl mx-auto px-5 md:px-6 pt-8 md:pt-12 pb-24 md:pb-16 outline-none"
      >
        {children}
      </main>
      <FeedbackWidget />
    </div>
  );
}
