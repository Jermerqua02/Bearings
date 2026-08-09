import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { AppProvider } from "@/lib/profile-context";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Northstar — an honest college counselor, always available",
    template: "%s · Northstar",
  },
  description:
    "Northstar reads your actual profile, manages expectations honestly, and makes the college process navigable — for the families who can't hire a private counselor.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={inter.variable}>
      <body>
        <AppProvider>{children}</AppProvider>
      </body>
    </html>
  );
}
