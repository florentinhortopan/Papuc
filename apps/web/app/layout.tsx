import type { Metadata } from "next";

import {
  buildRootMetadata,
  faqPageJsonLd,
  jsonLdScriptProps,
  organizationJsonLd,
  softwareApplicationJsonLd,
  websiteJsonLd,
} from "@/lib/site-meta";

import "./globals.css";

export const metadata: Metadata = buildRootMetadata();

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <head>
        <script {...jsonLdScriptProps(organizationJsonLd())} />
        <script {...jsonLdScriptProps(websiteJsonLd())} />
        <script {...jsonLdScriptProps(softwareApplicationJsonLd())} />
        <script {...jsonLdScriptProps(faqPageJsonLd())} />
      </head>
      <body className="bg-background text-text font-sans antialiased min-h-screen">
        {children}
      </body>
    </html>
  );
}
