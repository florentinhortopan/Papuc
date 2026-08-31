/**
 * Legal document versions and helpers.
 * Bump LEGAL_VERSION when Terms, Privacy, or Acceptable Use materially change;
 * users with an older profiles.legal_version must re-accept before using the app.
 *
 * These texts are product drafts aligned with docs/plan-legal-docs-and-listing-compliance.md.
 * Have US counsel review before relying on them for compliance.
 */

export const LEGAL_VERSION = "2026-08-31";

export const LEGAL_EFFECTIVE_DATE = "August 31, 2026";

export const LEGAL_CONTACT_EMAIL = "support@papuc.app";

export type LegalDocId = "terms" | "privacy" | "acceptable-use" | "data-disclaimer";

export const LEGAL_DOC_META: Record<
  LegalDocId,
  { title: string; href: `/${string}`; description: string }
> = {
  terms: {
    title: "Terms of Service",
    href: "/terms",
    description:
      "Papuc Terms of Service — evaluation software, accounts, acceptable use, and disclaimers.",
  },
  privacy: {
    title: "Privacy Policy",
    href: "/privacy",
    description:
      "How Papuc collects, uses, and shares account, project, and deal data.",
  },
  "acceptable-use": {
    title: "Acceptable Use Policy",
    href: "/acceptable-use",
    description:
      "Rules for using Papuc, listing data, social features, and exports.",
  },
  "data-disclaimer": {
    title: "Data & Listings Disclaimer",
    href: "/data-disclaimer",
    description:
      "Papuc is not an MLS, IDX portal, or brokerage — listing and model disclaimers.",
  },
};

/** Cookie set on sign-in when the user checks the agreement box (pre-OAuth). */
export const LEGAL_INTENT_COOKIE = "papuc_legal_intent";

export function hasAcceptedCurrentLegal(profile: {
  legal_accepted_at: string | null;
  legal_version: string | null;
} | null): boolean {
  if (!profile?.legal_accepted_at) return false;
  return profile.legal_version === LEGAL_VERSION;
}
