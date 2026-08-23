/**
 * Listing URL allowlist + normalize for "paste a property into Papuc".
 * Never fetch arbitrary hosts — only known listing platforms, then resolve
 * via Papuc providers (HasData / RealEstateAPI).
 */

export type ListingUrlPlatform = "zillow" | "redfin" | "realtor" | "homes" | "unknown";

export type ParsedListingUrl = {
  ok: true;
  /** Canonical https URL without tracking junk. */
  canonicalUrl: string;
  platform: ListingUrlPlatform;
  /** Zillow property id when present in the path. */
  zpid?: string;
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

/**
 * Normalize a pasted listing URL for provider resolution.
 * MVP resolve path is Zillow-only; other allowlisted hosts return
 * `unsupported_platform` so the UI can say "coming soon".
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
        "Only known listing sites are allowed (Zillow today; Redfin / Realtor / Homes coming soon). We never fetch arbitrary URLs.",
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

  if (platform !== "zillow") {
    return {
      ok: false,
      code: "unsupported_platform",
      message: `${platform} links are recognized but not imported yet — paste a Zillow homedetails URL for now.`,
    };
  }

  const zpid = extractZillowZpid(canonical);
  if (!zpid && !/\/homedetails\//i.test(canonical)) {
    return {
      ok: false,
      code: "unsupported_platform",
      message:
        "Need a Zillow property page (homedetails URL with a zpid), not a search or city page.",
    };
  }

  return {
    ok: true,
    canonicalUrl: canonical,
    platform: "zillow",
    zpid,
    host,
  };
}
