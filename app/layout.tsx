import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { AppProvider } from "@/lib/profile-context";
import { getViewer } from "@/lib/auth/policy";
import { emptySnapshotFor, loadSnapshot } from "@/lib/db/queries/snapshot";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Bearings — an honest college counselor, always available",
    template: "%s · Bearings",
  },
  description:
    "Bearings reads your actual profile, manages expectations honestly, and makes the college process navigable — for the families who can't hire a private counselor.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Hydrate the client store from the database. Signed-out visitors (landing,
  // sign-in) get the empty snapshot, so public pages still render.
  const viewer = await getViewer();
  const snapshot = viewer ? await loadSnapshot(viewer) : emptySnapshotFor(null);

  return (
    <html lang="en" className={inter.variable}>
      <body>
        {/*
          Keyed on the account. AppProvider copies the snapshot into state
          once, on mount, so a new snapshot from the server is otherwise
          ignored — and sign-in navigates client-side (router.push +
          refresh), keeping the provider mounted. The signed-in user landed
          on "Welcome. Let's get acquainted." with a finished profile in the
          database, because the store still held the signed-out snapshot.
          A change of account now remounts it with the right one.
        */}
        <AppProvider key={viewer?.userId ?? "signed-out"} snapshot={snapshot}>
          {children}
        </AppProvider>
      </body>
    </html>
  );
}
