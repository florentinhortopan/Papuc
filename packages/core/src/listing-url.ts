/**
 * Listing URL allowlist + normalize for "paste a property into Papuc".
 * Never fetch arbitrary hosts — only known listing platforms, then resolve
 * via Papuc providers (HasData Zillow detail, or address → Zillow search).
 */

export type ListingUrlPlatform =
  | "zillow"
  | "redfin"
  | "realtor"
  | "homes"
  | "unknown";

export type ListingAddressHint = {
  street?: string;
  city?: string;
  state?: string;
  zip?: string;
  /** Single-line string suitable for HasData `keyword` search. */
  keyword: string;
  source: "slug" | "llm";
  confidence: "high" | "medium" | "low";
};

export type ParsedListingUrl = {
  ok: true;
  /** Canonical https URL without tracking junk. */
  canonicalUrl: string;
  platform: ListingUrlPlatform;
  /** Zillow property id when present in the path. */
  zpid?: string;
  /** Platform listing id when present (Redfin home id, Realtor M-id, etc.). */
  listingId?: string;
  /** Best-effort address from the URL slug (may be refined by LLM). */
  addressHint?: ListingAddressHint;
  host: string;
};

export type ParsedListingUrlError = {
  ok: false;
  code:
    | "empty"
    | "no_url"
    | "invalid_url"
    | "unsupported_host"
    | "unsupported_platform";
  message: string;
};

const TRACKING_PARAMS = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "utm_id",
  "gclid",
  "fbclid",
  "msclkid",
  "mc_cid",
  "mc_eid",
  "ref",
  "ref_",
  "sid",
  "searchQueryState",
]);

/** Host suffixes we accept (lowercase, no leading dot). */
const PLATFORM_HOSTS: Array<{ platform: ListingUrlPlatform; suffixes: string[] }> = [
  { platform: "zillow", suffixes: ["zillow.com", "zillowstatic.com"] },
  { platform: "redfin", suffixes: ["redfin.com"] },
  { platform: "realtor", suffixes: ["realtor.com"] },
  { platform: "homes", suffixes: ["homes.com"] },
];

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

function hostMatches(host: string, suffix: string): boolean {
  return host === suffix || host.endsWith(`.${suffix}`);
}

export function detectListingPlatform(host: string): ListingUrlPlatform {
  const h = host.toLowerCase().replace(/^www\./, "");
  for (const row of PLATFORM_HOSTS) {
    if (row.suffixes.some((s) => hostMatches(h, s))) return row.platform;
  }
  return "unknown";
}

/** Pull the first http(s) URL out of pasted text. */
export function extractUrlFromText(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) {
    const first = trimmed.split(/\s+/)[0]!;
    return first;
  }
  const m = trimmed.match(/https?:\/\/[^\s<>"')\]]+/i);
  return m?.[0] ?? null;
}

/**
 * Extract Zillow zpid from common path shapes:
 *   /homedetails/.../63838278_zpid/
 *   /.../_zpid/63838278
 *   query ?zpid=63838278
 */
export function extractZillowZpid(url: string): string | undefined {
  const fromPath = url.match(/\/(\d+)_zpid\/?/i);
  if (fromPath?.[1]) return fromPath[1];
  try {
    const u = new URL(url);
    const q = u.searchParams.get("zpid");
    if (q && /^\d+$/.test(q)) return q;
  } catch {
    /* ignore */
  }
  return undefined;
}

function unslug(segment: string): string {
  return decodeURIComponent(segment)
    .replace(/[-_+]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Build a HasData keyword from address parts. */
export function formatAddressKeyword(parts: {
  street?: string;
  city?: string;
  state?: string;
  zip?: string;
}): string | null {
  const street = parts.street?.trim();
  const city = parts.city?.trim();
  const state = parts.state?.trim()?.toUpperCase();
  const zip = parts.zip?.trim();
  if (!street) return null;
  const bits = [street];
  if (city) bits.push(city);
  if (state) bits.push(state);
  if (zip) bits.push(zip);
  return bits.join(", ");
}

function hintFromParts(
  parts: { street?: string; city?: string; state?: string; zip?: string },
  confidence: ListingAddressHint["confidence"],
): ListingAddressHint | undefined {
  const keyword = formatAddressKeyword(parts);
  if (!keyword) return undefined;
  return {
    ...parts,
    state: parts.state?.toUpperCase(),
    keyword,
    source: "slug",
    confidence,
  };
}

/**
 * Redfin: /TX/Austin/123-Main-St/home/12345
 *          /CA/San-Francisco/123-Main-St-94102/home/987
 */
export function extractRedfinAddress(url: string): {
  hint?: ListingAddressHint;
  listingId?: string;
} {
  try {
    const path = new URL(url).pathname;
    const m = path.match(
      /^\/([A-Za-z]{2})\/([^/]+)\/([^/]+)\/home\/(\d+)\/?/i,
    );
    if (!m) return {};
    const state = m[1]!.toUpperCase();
    if (!US_STATE.has(state)) return { listingId: m[4] };
    const city = unslug(m[2]!);
    let streetSlug = m[3]!;
    let zip: string | undefined;
    const zipTail = streetSlug.match(/-(\d{5})(?:-\d{4})?$/);
    if (zipTail) {
      zip = zipTail[1];
      streetSlug = streetSlug.slice(0, -zipTail[0].length);
    }
    const street = unslug(streetSlug);
    const hint = hintFromParts(
      { street, city, state, zip },
      zip ? "high" : "medium",
    );
    return { hint, listingId: m[4] };
  } catch {
    return {};
  }
}

/**
 * Realtor: /realestateandhomes-detail/123-Main-St_Austin_TX_78701_M12345-67890
 *          …/123-Oak_Apt-2_San-Jose_CA_95112_M…
 */
export function extractRealtorAddress(url: string): {
  hint?: ListingAddressHint;
  listingId?: string;
} {
  try {
    const path = new URL(url).pathname;
    const m = path.match(/\/realestateandhomes-detail\/([^/?#]+)/i);
    if (!m?.[1]) return {};
    const slug = decodeURIComponent(m[1]);
    const parts = slug.split("_").filter(Boolean);
    if (parts.length < 4) return {};

    let listingId: string | undefined;
    const last = parts[parts.length - 1]!;
    if (/^M[\w-]+$/i.test(last)) {
      listingId = last;
      parts.pop();
    }

    let zip: string | undefined;
    const maybeZip = parts[parts.length - 1]!;
    if (/^\d{5}(?:-\d{4})?$/.test(maybeZip)) {
      zip = maybeZip.slice(0, 5);
      parts.pop();
    }

    let state: string | undefined;
    const maybeState = parts[parts.length - 1]!;
    if (US_STATE.has(maybeState.toUpperCase())) {
      state = maybeState.toUpperCase();
      parts.pop();
    }

    if (!state || parts.length < 2) {
      return { listingId };
    }

    const city = unslug(parts[parts.length - 1]!);
    const street = unslug(parts.slice(0, -1).join(" "));
    const hint = hintFromParts(
      { street, city, state, zip },
      zip ? "high" : "medium",
    );
    return { hint, listingId };
  } catch {
    return {};
  }
}

/**
 * Homes.com: /property/123-main-st-austin-tx-78701/abc123/
 * Prefer street-suffix split so multi-word cities (San Francisco) work.
 */
export function extractHomesAddress(url: string): {
  hint?: ListingAddressHint;
  listingId?: string;
} {
  try {
    const path = new URL(url).pathname;
    const m = path.match(/\/property\/([^/]+)(?:\/([^/?#]+))?/i);
    if (!m?.[1]) return {};
    const listingId = m[2] && m[2] !== "details" ? m[2] : undefined;
    const slug = decodeURIComponent(m[1]);
    const tokens = slug.split("-").filter(Boolean);
    if (tokens.length < 4) return { listingId };

    let zip: string | undefined;
    let state: string | undefined;
    let end = tokens.length;

    if (/^\d{5}$/.test(tokens[end - 1]!)) {
      zip = tokens[end - 1];
      end -= 1;
    }
    if (end >= 1 && US_STATE.has(tokens[end - 1]!.toUpperCase())) {
      state = tokens[end - 1]!.toUpperCase();
      end -= 1;
    }
    if (!state) return { listingId };

    const body = tokens.slice(0, end);
    const STREET_SUFFIX = new Set([
      "st",
      "street",
      "ave",
      "avenue",
      "rd",
      "road",
      "blvd",
      "boulevard",
      "dr",
      "drive",
      "ln",
      "lane",
      "ct",
      "court",
      "way",
      "pl",
      "place",
      "cir",
      "circle",
      "ter",
      "terrace",
      "hwy",
      "highway",
      "pkwy",
      "parkway",
    ]);
    let suffixIdx = -1;
    for (let i = body.length - 1; i >= 1; i--) {
      if (STREET_SUFFIX.has(body[i]!.toLowerCase())) {
        suffixIdx = i;
        break;
      }
    }

    let street: string;
    let city: string;
    if (suffixIdx >= 1 && suffixIdx < body.length - 1) {
      street = unslug(body.slice(0, suffixIdx + 1).join("-"));
      city = unslug(body.slice(suffixIdx + 1).join("-"));
    } else {
      // Fallback: last token = city.
      if (body.length < 2) return { listingId };
      city = unslug(body[body.length - 1]!);
      street = unslug(body.slice(0, -1).join("-"));
    }
    if (!street) return { listingId };

    const hint = hintFromParts(
      { street, city, state, zip },
      zip ? "medium" : "low",
    );
    return { hint, listingId };
  } catch {
    return {};
  }
}

/** Deterministic slug → address for allowlisted platforms. */
export function extractAddressFromListingUrl(
  platform: ListingUrlPlatform,
  url: string,
): { hint?: ListingAddressHint; listingId?: string; zpid?: string } {
  if (platform === "zillow") {
    const zpid = extractZillowZpid(url);
    // Prefer HasData detail by URL; address hint is optional.
    const fromSlug = streetFromHomedetailsSlug(url);
    const hint = fromSlug
      ? hintFromParts(fromSlug, fromSlug.zip ? "high" : "medium")
      : undefined;
    return { hint, zpid };
  }
  if (platform === "redfin") return extractRedfinAddress(url);
  if (platform === "realtor") return extractRealtorAddress(url);
  if (platform === "homes") return extractHomesAddress(url);
  return {};
}

function streetFromHomedetailsSlug(url: string): {
  street?: string;
  city?: string;
  state?: string;
  zip?: string;
} | null {
  try {
    const path = new URL(url).pathname;
    const m = path.match(/\/homedetails\/([^/]+)\/\d+_zpid/i);
    if (!m?.[1]) return null;
    const tokens = decodeURIComponent(m[1]).split("-").filter(Boolean);
    if (tokens.length < 3) {
      return { street: unslug(m[1]) };
    }
    let end = tokens.length;
    let zip: string | undefined;
    let state: string | undefined;
    if (/^\d{5}$/.test(tokens[end - 1]!)) {
      zip = tokens[end - 1];
      end -= 1;
    }
    if (end >= 1 && US_STATE.has(tokens[end - 1]!.toUpperCase())) {
      state = tokens[end - 1]!.toUpperCase();
      end -= 1;
    }
    if (!state) return { street: unslug(tokens.slice(0, end).join("-")) };
    const city = unslug(tokens[end - 1]!);
    const street = unslug(tokens.slice(0, end - 1).join("-"));
    return { street, city, state, zip };
  } catch {
    return null;
  }
}

function isPropertyPage(platform: ListingUrlPlatform, url: string): boolean {
  try {
    const path = new URL(url).pathname;
    if (platform === "zillow") {
      return /\/homedetails\//i.test(path) || Boolean(extractZillowZpid(url));
    }
    if (platform === "redfin") {
      return /\/home\/\d+/i.test(path);
    }
    if (platform === "realtor") {
      return /\/realestateandhomes-detail\//i.test(path);
    }
    if (platform === "homes") {
      return /\/property\//i.test(path);
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Normalize a pasted listing URL for provider resolution.
 * Zillow resolves by URL; Redfin / Realtor / Homes resolve via address → HasData.
 */
export function parseListingUrl(
  input: string,
): ParsedListingUrl | ParsedListingUrlError {
  const raw = (input ?? "").trim();
  if (!raw) {
    return { ok: false, code: "empty", message: "Paste a listing URL." };
  }

  const extracted = extractUrlFromText(raw);
  if (!extracted) {
    return {
      ok: false,
      code: "no_url",
      message: "No http(s) URL found in the pasted text.",
    };
  }

  let parsed: URL;
  try {
    parsed = new URL(extracted);
  } catch {
    return { ok: false, code: "invalid_url", message: "That does not look like a valid URL." };
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false, code: "invalid_url", message: "Only http(s) listing URLs are allowed." };
  }

  const host = parsed.hostname.toLowerCase();
  const platform = detectListingPlatform(host);
  if (platform === "unknown") {
    return {
      ok: false,
      code: "unsupported_host",
      message:
        "Only known listing sites are allowed (Zillow, Redfin, Realtor, Homes). We never fetch arbitrary URLs.",
    };
  }

  // Strip tracking / share junk; keep path + essential query.
  parsed.hash = "";
  for (const key of [...parsed.searchParams.keys()]) {
    if (TRACKING_PARAMS.has(key.toLowerCase()) || key.toLowerCase().startsWith("utm_")) {
      parsed.searchParams.delete(key);
    }
  }
  parsed.protocol = "https:";

  const canonical = (() => {
    const u = new URL(parsed.toString());
    let href = u.origin + u.pathname;
    if (u.search) href += u.search;
    return href;
  })();

  if (!isPropertyPage(platform, canonical)) {
    return {
      ok: false,
      code: "unsupported_platform",
      message:
        platform === "zillow"
          ? "Need a Zillow property page (homedetails URL with a zpid), not a search or city page."
          : `Need a ${platform} property detail page, not a search or city page.`,
    };
  }

  const extractedAddr = extractAddressFromListingUrl(platform, canonical);

  return {
    ok: true,
    canonicalUrl: canonical,
    platform,
    zpid: extractedAddr.zpid,
    listingId: extractedAddr.listingId,
    addressHint: extractedAddr.hint,
    host,
  };
}
