import type { Metadata } from "next";

import { getSiteUrl } from "@/lib/site-url";

import "./globals.css";

const site = getSiteUrl();

export const metadata: Metadata = {
  metadataBase: new URL(site),
  title: "Papuc — DSCR Deal Scout",
  description:
    "Describe a rental investment goal in plain English. Papuc scouts MLS, runs a full pro-forma, and ranks DSCR-loan-friendly deals.",
  openGraph: {
    siteName: "Papuc",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="bg-background text-text font-sans antialiased min-h-screen">
        {children}
      </body>
    </html>
  );
}
