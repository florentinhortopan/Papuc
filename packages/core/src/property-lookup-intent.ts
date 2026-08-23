import {
  detectListingPlatform,
  extractUrlFromText,
  parseListingUrl,
} from "./listing-url";

export type PropertyLookupIntent =
  | { kind: "url"; value: string }
  | { kind: "address"; value: string };

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

/** Broad scout / goal language — not a single-property lookup. */
const SCOUT_INTENT =
  /\b(cash\s*flow|cashflow|looking for|want(?:ing)?\s+(?:a|an|some)|under\s*\$?\d|below\s*\$?\d|max(?:imum)?\s*(?:price|budget)|dscr|airbnb|short[\s-]?term|scout|portfolio|beds?\b|bedrooms?|bath(?:room)?s?|near\s+\w+.+\bunder\b|family of|down payment|invest(?:ment|ing)?)\b/i;

/**
 * Detect when free text is asking for one specific listing (URL or street
 * address) rather than a scout/search brief.
 */
export function detectPropertyLookupIntent(
  text: string,
): PropertyLookupIntent | null {
  const raw = (text ?? "").trim();
  if (!raw || raw.length > 280) return null;

  const url = extractUrlFromText(raw);
  if (url) {
    try {
      const host = new URL(url).hostname;
      const platform = detectListingPlatform(host);
      if (platform !== "unknown") {
        const parsed = parseListingUrl(url);
        if (parsed.ok) return { kind: "url", value: parsed.canonicalUrl };
        // Allowlisted host but not a detail page yet — still treat as URL intent
        // so callers can surface the parse error instead of scout.
        if (
          /zillow|redfin|realtor|homes\.com/i.test(host) &&
          !SCOUT_INTENT.test(raw)
        ) {
          return { kind: "url", value: url };
        }
      }
    } catch {
      /* fall through */
    }
  }

  if (SCOUT_INTENT.test(raw)) return null;

  return looksLikeUsStreetAddress(raw)
    ? { kind: "address", value: collapseWs(raw) }
    : null;
}

function collapseWs(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/**
 * Heuristic US street address: leading house number + street token, plus
 * state and/or ZIP so we are not matching "3 beds in Austin".
 */
export function looksLikeUsStreetAddress(text: string): boolean {
  const t = collapseWs(text);
  if (t.length < 10 || t.length > 160) return false;
  if (!/^\d{1,6}\s+[A-Za-z]/.test(t)) return false;

  const hasZip = /\b\d{5}(?:-\d{4})?\b/.test(t);
  const stateMatch = t.match(/\b([A-Za-z]{2})\b/g) ?? [];
  const hasState = stateMatch.some((s) => US_STATE.has(s.toUpperCase()));
  // "Austin, TX" / "Austin TX" style city+state without forcing ZIP.
  const cityState = /,\s*[A-Za-z]{2}\b/.test(t) || /\b[A-Za-z][a-z]+\s+[A-Z]{2}\b/.test(t);

  if (!(hasZip || hasState || cityState)) return false;

  // Require at least one street-ish token after the number.
  const afterNum = t.replace(/^\d{1,6}\s+/, "");
  if (!/[A-Za-z]{2,}/.test(afterNum)) return false;

  return true;
}
