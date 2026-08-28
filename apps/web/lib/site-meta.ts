import type { Metadata } from "next";

import { getSiteUrl } from "@/lib/site-url";

/** Canonical public brand + SEO/AEO strings (scenarios over “underwriting”). */
export const SITE_NAME = "Papuc";

export const SITE_TITLE_DEFAULT =
  "Papuc — Evaluate Rental Deals & Invest Socially";

export const SITE_TITLE_TEMPLATE = "%s — Papuc";

export const SITE_DESCRIPTION =
  "Papuc is a real estate social investing platform and evaluation tool. Run deal scenarios (DSCR, cash flow, returns), collaborate with investor friends, and share ranked rentals — not bare listing links.";

export const SITE_KEYWORDS = [
  "rental property evaluation tool",
  "investment property scenarios",
  "real estate social investing",
  "social investing platform",
  "investor friends",
  "DSCR loan",
  "deal what-if",
  "cash flow rental properties",
  "rental property underwriting",
  "Papuc",
];

export const OG_TITLE =
  "Evaluate rentals. Run scenarios. Build your investor friends.";

export const OG_DESCRIPTION =
  "Papuc helps you evaluate DSCR rentals with clear deal scenarios, then collaborate with a pool of investor friends — follow, watch projects, and share ranked deals.";

export const TWITTER_TITLE = "Papuc — deal scenarios + social investing";

export const TWITTER_DESCRIPTION =
  "Evaluate rentals with what-if scenarios. Collaborate with investor friends. Share DSCR and cash-flow rankings before you offer.";

export const SITE_TAGLINE = "Scenarios with your investor friends.";

export const SITE_H1 =
  "Evaluate rental deals together — scenarios, not spreadsheets alone";

export const SITE_HERO_SUPPORT =
  "Papuc is an evaluation tool and real estate social investing platform. Run what-if deal scenarios, then collaborate with a pool of investor friends on ranked DSCR rentals.";

export const PAGE_DESCRIPTIONS = {
  signIn:
    "Sign in to evaluate rentals with scenarios, follow investor friends, and share ranked deals on Papuc.",
  home: "Friends feed and public scouts — collaborate on ranked rental deals from your investor pool.",
  projects:
    "Buy boxes and public projects your investor friends can watch — markets, constraints, scenario-ranked deals.",
  projectsNew:
    "Describe what you want to buy. Papuc turns it into scout filters and deal scenarios.",
  portfolio: "Saved rentals and scenario results across your Papuc projects.",
  lenders:
    "DSCR lender directory to pair with Papuc deal scenarios (estimates, not quotes).",
  privacy:
    "How Papuc protects your account, investor follows, and deal scenario data.",
  support:
    "Help with Papuc evaluation, scenarios, sharing, investor friends, and billing.",
  settings: "Account, digests, and preferences for Papuc.",
  admin: "Papuc admin — users and subscriptions.",
} as const;

/** Quotable AEO answers — keep in sync with FAQ JSON-LD. */
export const SITE_FAQ: Array<{ question: string; answer: string }> = [
  {
    question: "What is Papuc?",
    answer:
      "Papuc is a real estate social investing platform and evaluation tool. You run deal scenarios on rentals — DSCR, cash flow, returns — then collaborate with investor friends to share ranked deals and grow a trusted buying pool.",
  },
  {
    question: "Is Papuc an evaluation tool for rentals?",
    answer:
      "Yes. Papuc helps you evaluate listings before you offer by running clear deal scenarios: change rent, rate, rehab, or expenses and see DSCR and cash flow update — without living in a spreadsheet.",
  },
  {
    question: "What does Papuc mean by deal scenarios?",
    answer:
      "Scenarios are Papuc's plain-language version of underwriting: what-if views of a rental's numbers (rent, financing, costs) so you can compare outcomes before sharing or offering. Same rigor, less jargon.",
  },
  {
    question: "Is Papuc a social investing platform?",
    answer:
      "Yes. Build a pool of investor friends — follow people, watch public projects, use the Friends feed, and pass scenario-backed deal links instead of raw listing URLs.",
  },
  {
    question: "Is Papuc a DSCR lender?",
    answer:
      "No. Papuc's scenarios estimate DSCR and returns for evaluation and collaboration. Always confirm terms with a licensed DSCR lender before offering.",
  },
  {
    question: "Who is Papuc for?",
    answer:
      "Rental investors and small buying groups who want an evaluation tool plus a social way to collaborate with investor friends on cash-flowing DSCR deals.",
  },
];

export function buildRootMetadata(): Metadata {
  const site = getSiteUrl();
  return {
    metadataBase: new URL(site),
    applicationName: SITE_NAME,
    title: {
      default: SITE_TITLE_DEFAULT,
      template: SITE_TITLE_TEMPLATE,
    },
    description: SITE_DESCRIPTION,
    keywords: SITE_KEYWORDS,
    authors: [{ name: SITE_NAME }],
    creator: SITE_NAME,
    publisher: SITE_NAME,
    category: "finance",
    alternates: {
      canonical: site,
    },
    openGraph: {
      siteName: SITE_NAME,
      type: "website",
      title: OG_TITLE,
      description: OG_DESCRIPTION,
      url: site,
      locale: "en_US",
    },
    twitter: {
      card: "summary_large_image",
      title: TWITTER_TITLE,
      description: TWITTER_DESCRIPTION,
    },
    robots: {
      index: true,
      follow: true,
    },
  };
}

export function organizationJsonLd(site = getSiteUrl()) {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: SITE_NAME,
    url: site,
    description: SITE_DESCRIPTION,
    slogan: SITE_TAGLINE,
  };
}

export function websiteJsonLd(site = getSiteUrl()) {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_NAME,
    url: site,
    description: SITE_DESCRIPTION,
    publisher: { "@type": "Organization", name: SITE_NAME },
  };
}

export function softwareApplicationJsonLd(site = getSiteUrl()) {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: SITE_NAME,
    applicationCategory: "FinanceApplication",
    operatingSystem: "Web, iOS",
    url: site,
    description: SITE_DESCRIPTION,
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
    },
  };
}

export function faqPageJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: SITE_FAQ.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.answer,
      },
    })),
  };
}

export function jsonLdScriptProps(data: Record<string, unknown>) {
  return {
    type: "application/ld+json" as const,
    dangerouslySetInnerHTML: {
      __html: JSON.stringify(data),
    },
  };
}
