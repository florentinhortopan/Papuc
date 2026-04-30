import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "Papuc — DSCR Deal Scout",
  description:
    "Describe a rental investment goal in plain English. Papuc scouts MLS, runs a full pro-forma, and ranks DSCR-loan-friendly deals.",
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
