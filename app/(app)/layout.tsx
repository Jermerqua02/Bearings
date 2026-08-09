import AppNav from "@/components/nav/AppNav";

export default function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="min-h-screen bg-paper">
      <AppNav />
      {/* pb clears the mobile tab bar */}
      <main className="max-w-6xl mx-auto px-5 md:px-6 pt-8 md:pt-12 pb-24 md:pb-16">
        {children}
      </main>
    </div>
  );
}
