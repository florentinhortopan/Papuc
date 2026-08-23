import {
  formatAddressKeyword,
  type ListingAddressHint,
} from "../listing-url";

const US_STATE = new Set([
  "AL",
  "AK",
  "AZ",
  "AR",
  "CA",
  "CO",
  "CT",
  "DE",
  "FL",
  "GA",
  "HI",
  "ID",
  "IL",
  "IN",
  "IA",
  "KS",
  "KY",
  "LA",
  "ME",
  "MD",
  "MA",
  "MI",
  "MN",
  "MS",
  "MO",
  "MT",
  "NE",
  "NV",
  "NH",
  "NJ",
  "NM",
  "NY",
  "NC",
  "ND",
  "OH",
  "OK",
  "OR",
  "PA",
  "RI",
  "SC",
  "SD",
  "TN",
  "TX",
  "UT",
  "VT",
  "VA",
  "WA",
  "WV",
  "WI",
  "WY",
  "DC",
]);

/** Normalize LLM (or raw) address extraction into a ListingAddressHint. */
export function normalizeExtractedListingAddress(
  raw: unknown,
): ListingAddressHint | null {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const street =
    typeof r.street === "string" && r.street.trim() ? r.street.trim() : undefined;
  const city =
    typeof r.city === "string" && r.city.trim() ? r.city.trim() : undefined;
  let state =
    typeof r.state === "string" && r.state.trim()
      ? r.state.trim().toUpperCase()
      : undefined;
  if (state && !US_STATE.has(state)) state = undefined;
  let zip =
    typeof r.zip === "string" && r.zip.trim() ? r.zip.trim() : undefined;
  if (zip) {
    const m = zip.match(/^(\d{5})/);
    zip = m?.[1];
  }
  const confRaw = typeof r.confidence === "string" ? r.confidence : "low";
  const confidence: ListingAddressHint["confidence"] =
    confRaw === "high" || confRaw === "medium" || confRaw === "low"
      ? confRaw
      : "low";

  const keyword = formatAddressKeyword({ street, city, state, zip });
  if (!keyword || !street) return null;
  if (confidence === "low" && !state) return null;

  return {
    street,
    city,
    state,
    zip,
    keyword,
    source: "llm",
    confidence,
  };
}

/** True when slug hint is good enough to skip the LLM. */
export function addressHintIsUsable(
  hint: ListingAddressHint | undefined,
): hint is ListingAddressHint {
  if (!hint?.street || !hint.keyword) return false;
  if (hint.confidence === "low") return false;
  // Need state (or zip) so Zillow keyword search is not nationwide-ambiguous.
  return Boolean(hint.state || hint.zip);
}
