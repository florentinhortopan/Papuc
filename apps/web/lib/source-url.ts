/**
 * Resolve a "view source" link for a deal.
 *
 * Preference order:
 *   1. The exact `source_url` we persisted at scout time (Zillow detail page
 *      from HasData, or any future provider's deep link).
 *   2. A best-effort Zillow address-search URL derived from the address
 *      fields. This is what we fall back to for legacy rows scouted before
 *      we tracked source_url, and for RealEstateAPI off-market records that
 *      never had a deep link in the first place.
 *
 * Returns null if neither a URL nor enough address data is available.
 */

export interface DealSourceLink {
  url: string;
  label: string;
  /** True iff this is a deep link to the actual listing; false for fallbacks. */
  isExact: boolean;
  /** "Zillow" | "Redfin" | "Realtor" | "Listing" — useful for icons / tooltips. */
  provider: string;
}

interface DealSourceInput {
  source_url?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
}

export function getDealSourceLink(deal: DealSourceInput): DealSourceLink | null {
  if (deal.source_url) {
    const host = safeHost(deal.source_url);
    if (host.includes("zillow")) {
      return { url: deal.source_url, label: "View on Zillow", isExact: true, provider: "Zillow" };
    }
    if (host.includes("redfin")) {
      return { url: deal.source_url, label: "View on Redfin", isExact: true, provider: "Redfin" };
    }
    if (host.includes("realtor")) {
      return { url: deal.source_url, label: "View on Realtor", isExact: true, provider: "Realtor" };
    }
    return { url: deal.source_url, label: "View listing", isExact: true, provider: "Listing" };
  }

  const fallback = buildZillowAddressSearchUrl(deal);
  if (!fallback) return null;
  return {
    url: fallback,
    label: "Search on Zillow",
    isExact: false,
    provider: "Zillow",
  };
}

/**
 * Build a Zillow address-search URL like
 *   https://www.zillow.com/homes/123-Main-St-Brooklyn-NY-11215_rb/
 * Zillow does fuzzy matching, so this lands on the property page when the
 * listing exists, or a search page otherwise.
 */
export function buildZillowAddressSearchUrl(deal: DealSourceInput): string | null {
  const parts = [deal.address, deal.city, deal.state, deal.zip]
    .map((p) => (typeof p === "string" ? p.trim() : ""))
    .filter(Boolean);
  if (parts.length === 0) return null;
  const slug = parts.join(" ").replace(/,/g, "").replace(/\s+/g, "-");
  return `https://www.zillow.com/homes/${encodeURIComponent(slug)}_rb/`;
}

function safeHost(url: string): string {
  try {
    return new URL(url).host.toLowerCase();
  } catch {
    return "";
  }
}
