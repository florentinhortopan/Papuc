/**
 * LTR rent comps: aggregate Zillow for-rent listing prices into a median
 * (plus p25/p75) expected monthly rent for a subject property.
 */

import type { ZillowListingSummary, ZillowSearchFilters } from "./hasdata";

export const LTR_RENT_ESTIMATE_SOURCE = "hasdata_for_rent";
export const LTR_RENT_MIN_COMPS = 3;

export interface LtrRentCompStats {
  median: number;
  p25: number;
  p75: number;
  comparableCount: number;
  /** Positive rent samples after filtering, sorted ascending. */
  rents: number[];
}

export interface LtrRentSearchSubject {
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  beds?: number | null;
  /** Zillow homeType enum, e.g. SINGLE_FAMILY. LOT is rejected by the API route. */
  homeType?: string | null;
}

/**
 * Map a Zillow listing `homeType` to the HasData `homeTypes[]` filter token.
 * Returns null when the type is unknown or unsupported for rent search.
 */
export function zillowHomeTypeToHasDataFilter(
  homeType: string | null | undefined,
): string | null {
  if (!homeType) return null;
  switch (homeType.toUpperCase()) {
    case "SINGLE_FAMILY":
    case "HOUSE":
      return "house";
    case "CONDO":
      return "condo";
    case "TOWNHOUSE":
    case "TOWNHOME":
      return "townhome";
    case "MULTI_FAMILY":
    case "MULTIFAMILY":
      return "multiFamily";
    case "APARTMENT":
      return "apartment";
    case "MANUFACTURED":
    case "MOBILE":
      return "manufactured";
    case "LOT":
    case "LAND":
      return null;
    default:
      return null;
  }
}

/**
 * Build HasData/Zillow forRent filters for a subject deal. Keyword prefers
 * "City, ST", then zip. Beds are banded ±1 when known.
 */
export function buildLtrRentCompFilters(
  subject: LtrRentSearchSubject,
): ZillowSearchFilters {
  const city = subject.city?.trim();
  const state = subject.state?.trim();
  const zip = subject.zip?.trim();
  let keyword: string;
  if (city && state) keyword = `${city}, ${state}`;
  else if (zip) keyword = zip;
  else if (state) keyword = state;
  else {
    throw new Error("deal has no city/state or zip to search rent comps");
  }

  const filters: ZillowSearchFilters = {
    keyword,
    type: "forRent",
  };

  const beds = subject.beds;
  if (typeof beds === "number" && Number.isFinite(beds) && beds >= 0) {
    const b = Math.round(beds);
    filters.bedsMin = Math.max(0, b - 1);
    filters.bedsMax = b + 1;
  }

  const homeFilter = zillowHomeTypeToHasDataFilter(subject.homeType);
  if (homeFilter) filters.homeTypes = [homeFilter];

  return filters;
}

/** Monthly rent from a for-rent listing: ask price, else rentZestimate. */
export function extractForRentMonthly(row: ZillowListingSummary): number | undefined {
  const ask = row.price;
  if (typeof ask === "number" && Number.isFinite(ask) && ask > 0) return ask;
  const rz = row.rentZestimate;
  if (typeof rz === "number" && Number.isFinite(rz) && rz > 0) return rz;
  return undefined;
}

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  const vLo = sorted[lo]!;
  const vHi = sorted[hi]!;
  if (lo === hi) return vLo;
  return vLo + (vHi - vLo) * (idx - lo);
}

/**
 * Aggregate positive monthly rents into median / p25 / p75. Returns null
 * when fewer than {@link LTR_RENT_MIN_COMPS} samples remain.
 */
export function aggregateLtrRentComps(
  rents: Array<number | undefined | null>,
): LtrRentCompStats | null {
  const cleaned = rents
    .filter((r): r is number => typeof r === "number" && Number.isFinite(r) && r > 0)
    .map((r) => Math.round(r))
    .sort((a, b) => a - b);
  if (cleaned.length < LTR_RENT_MIN_COMPS) return null;
  return {
    median: Math.round(percentile(cleaned, 0.5)),
    p25: Math.round(percentile(cleaned, 0.25)),
    p75: Math.round(percentile(cleaned, 0.75)),
    comparableCount: cleaned.length,
    rents: cleaned,
  };
}

export function aggregateLtrRentFromListings(
  listings: ZillowListingSummary[],
): LtrRentCompStats | null {
  return aggregateLtrRentComps(listings.map(extractForRentMonthly));
}
