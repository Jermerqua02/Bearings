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
      <AppNav role={viewer.role} name={viewer.name} email={viewer.email} />
      {/* pb clears the mobile tab bar */}
      <main className="max-w-6xl mx-auto px-5 md:px-6 pt-8 md:pt-12 pb-24 md:pb-16">
        {children}
      </main>
      <FeedbackWidget />
    </div>
  );
}
