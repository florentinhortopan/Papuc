import { extractZillowAddress, streetFromZillowUrl } from "@papuc/core";

/**
 * Best street/line address for UI. Prefers the persisted column, then
 * recovers from cached HasData `mls_data` / Zillow URL when scouting
 * wrote a null address (HasData field renames have done this before).
 */
export function dealStreetAddress(deal: {
  address?: string | null;
  mls_data?: unknown;
  source_url?: string | null;
}): string | null {
  if (typeof deal.address === "string" && deal.address.trim()) {
    return deal.address.trim();
  }
  if (deal.mls_data && typeof deal.mls_data === "object") {
    const fromMls = extractZillowAddress(
      deal.mls_data as Record<string, unknown>,
    );
    if (fromMls) return fromMls;
  }
  return streetFromZillowUrl(deal.source_url) ?? null;
}
