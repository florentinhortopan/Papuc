/**
 * HasData Zillow scraper client.
 *
 * https://docs.hasdata.com/apis/zillow/listing
 * https://docs.hasdata.com/apis/zillow/property
 *
 * Why HasData over RealEstateAPI for the MVP:
 *   - PAYG-friendly (no plan gating on listings).
 *   - Zillow data is what users compare against, so the prices on the deal
 *     cards match what they see on zillow.com.
 *   - `zestimate` and `rentZestimate` ride along on the search response, so
 *     we don't need a second per-listing call to get a rent estimate.
 *
 * Cost model (as of 2026-04): 5 credits per /scrape/zillow/listing call.
 * Property endpoint is 5 credits/call but optional — we don't use it on the
 * scout hot path.
 *
 * Critical wiring details from the HasData agent skill:
 *   - Auth: `x-api-key` header.
 *   - Filters use bracketed keys (`price[min]`, `beds[max]`, etc.).
 *   - Server-side deadline is 300s, so client timeout MUST be ≥ 300s.
 *   - `requestMetadata.status === "ok"` is the only success signal — HTTP
 *     200 alone is not enough.
 *   - Retries: 429 and 5xx only. Never retry 4xx.
 */

export const HASDATA_BASE = "https://api.hasdata.com";

export interface HasDataClientOptions {
  apiKey: string;
  fetchFn?: typeof fetch;
  baseUrl?: string;
  maxRetries?: number;
  /**
   * Per-request timeout in ms. HasData's server deadline is 300s, so anything
   * shorter creates phantom failures while you still get billed on completion.
   * Default 310_000.
   */
  timeoutMs?: number;
}

export type ZillowListingType = "forSale" | "forRent" | "sold";

export interface ZillowSearchFilters {
  /** Area string. "Brooklyn, NY", "94703", "Park Slope, Brooklyn". */
  keyword: string;
  /** Default: "forSale". */
  type?: ZillowListingType;
  priceMin?: number;
  priceMax?: number;
  bedsMin?: number;
  bedsMax?: number;
  bathsMin?: number;
  bathsMax?: number;
  sqftMin?: number;
  sqftMax?: number;
  /** "24h" | "7d" | "14d" | "30d" | "90d" | "6m" | "12m" */
  daysOnZillow?: string;
  /** SINGLE_FAMILY, CONDO, TOWNHOUSE, MULTI_FAMILY, APARTMENT, MANUFACTURED, LOT */
  homeTypes?: string[];
  page?: number;
}

export interface ZillowListingSummary {
  /** Zillow's stable property id. Stringified for db storage. */
  zpid: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  /** List price (forSale/forRent) or sold price (sold). */
  price?: number;
  /** Zillow Zestimate (AVM). */
  zestimate?: number;
  /** Zillow Rent Zestimate (monthly $). */
  rentZestimate?: number;
  beds?: number;
  baths?: number;
  sqft?: number;
  /** SINGLE_FAMILY | CONDO | etc. (Zillow enum). */
  homeType?: string;
  /** FOR_SALE | PENDING | SOLD | etc. (Zillow enum). */
  homeStatus?: string;
  daysOnZillow?: number;
  imgSrc?: string;
  /** Full Zillow URL — required to call the Zillow Property endpoint later. */
  detailUrl?: string;
  lat?: number;
  lng?: number;
  raw?: unknown;
}

export interface ZillowSearchResult {
  total: number;
  resultCount: number;
  data: ZillowListingSummary[];
  page?: number;
  totalPages?: number;
  raw?: unknown;
}

export class HasDataError extends Error {
  constructor(
    public status: number,
    public body: string,
  ) {
    super(`HasData ${status}: ${body.slice(0, 200)}`);
    this.name = "HasDataError";
  }
}

export class HasDataClient {
  private apiKey: string;
  private fetchFn: typeof fetch;
  private baseUrl: string;
  private maxRetries: number;
  private timeoutMs: number;

  constructor(opts: HasDataClientOptions) {
    if (!opts.apiKey) throw new Error("HasDataClient: apiKey required");
    this.apiKey = opts.apiKey;
    this.fetchFn = opts.fetchFn ?? fetch;
    this.baseUrl = opts.baseUrl ?? HASDATA_BASE;
    this.maxRetries = opts.maxRetries ?? 3;
    this.timeoutMs = opts.timeoutMs ?? 310_000;
  }

  /**
   * Search Zillow listings via /scrape/zillow/listing.
   * Returns `properties` from the upstream response, normalized.
   * Throws HasDataError on non-2xx after retry, or if
   * `requestMetadata.status` is not "ok".
   */
  async searchZillow(filters: ZillowSearchFilters): Promise<ZillowSearchResult> {
    const params = buildZillowParams(filters);
    const url = `${this.baseUrl}/scrape/zillow/listing?${params.toString()}`;

    const raw = await this.requestGet<{
      requestMetadata?: { status?: string; id?: string; url?: string };
      searchInformation?: unknown;
      properties?: unknown[];
      pagination?: { currentPage?: number; totalPages?: number; totalCount?: number };
    }>(url);

    const status = raw.requestMetadata?.status;
    if (status && status !== "ok") {
      throw new HasDataError(
        200,
        `requestMetadata.status=${status} id=${raw.requestMetadata?.id ?? "?"}`,
      );
    }

    const properties = Array.isArray(raw.properties) ? raw.properties : [];
    const data = properties
      .map((p) => normalizeZillowListing(p))
      .filter((l): l is ZillowListingSummary => Boolean(l.zpid));

    return {
      total: raw.pagination?.totalCount ?? data.length,
      resultCount: data.length,
      page: raw.pagination?.currentPage,
      totalPages: raw.pagination?.totalPages,
      data,
      raw,
    };
  }

  private async requestGet<T>(url: string): Promise<T> {
    let lastErr: unknown;
    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const res = await this.fetchFn(url, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": this.apiKey,
          },
          signal: controller.signal,
        });
        if (res.status === 429 || res.status >= 500) {
          const wait = Math.min(2 ** attempt * 500, 8000);
          await sleep(wait);
          continue;
        }
        if (!res.ok) {
          const text = await safeText(res);
          throw new HasDataError(res.status, text);
        }
        return (await res.json()) as T;
      } catch (err) {
        lastErr = err;
        if (err instanceof HasDataError && err.status >= 400 && err.status < 500) {
          throw err;
        }
        if (attempt === this.maxRetries - 1) throw err;
        await sleep(Math.min(2 ** attempt * 500, 8000));
      } finally {
        clearTimeout(timer);
      }
    }
    throw lastErr ?? new Error("HasData request failed");
  }
}

/**
 * Build the URLSearchParams for /scrape/zillow/listing.
 * Bracketed keys (`price[min]`, etc.) are required by HasData and are
 * appended as literal `key[min]` strings.
 */
export function buildZillowParams(filters: ZillowSearchFilters): URLSearchParams {
  const p = new URLSearchParams();
  p.set("keyword", filters.keyword);
  p.set("type", filters.type ?? "forSale");

  if (filters.priceMin !== undefined) p.set("price[min]", String(filters.priceMin));
  if (filters.priceMax !== undefined) p.set("price[max]", String(filters.priceMax));
  if (filters.bedsMin !== undefined) p.set("beds[min]", String(filters.bedsMin));
  if (filters.bedsMax !== undefined) p.set("beds[max]", String(filters.bedsMax));
  if (filters.bathsMin !== undefined) p.set("baths[min]", String(filters.bathsMin));
  if (filters.bathsMax !== undefined) p.set("baths[max]", String(filters.bathsMax));
  if (filters.sqftMin !== undefined) p.set("sqft[min]", String(filters.sqftMin));
  if (filters.sqftMax !== undefined) p.set("sqft[max]", String(filters.sqftMax));
  if (filters.daysOnZillow) p.set("daysOnZillow", filters.daysOnZillow);
  if (filters.page !== undefined) p.set("page", String(filters.page));

  if (filters.homeTypes && filters.homeTypes.length) {
    for (const t of filters.homeTypes) p.append("homeTypes[]", t);
  }
  return p;
}

/**
 * Defensive normalizer — Zillow record field names vary across HasData
 * response variants ("address" can be a string or an object with parts;
 * "imgSrc" sometimes appears as "image"; etc.). Prefer the most specific
 * field, fall back to the next.
 */
export function normalizeZillowListing(item: unknown): ZillowListingSummary {
  if (!item || typeof item !== "object") {
    return { zpid: "" };
  }
  const o = item as Record<string, any>;
  const addr = typeof o.address === "object" && o.address !== null ? o.address : {};
  const addressString =
    typeof o.address === "string"
      ? o.address
      : addr.streetAddress ??
        addr.address ??
        o.streetAddress ??
        undefined;

  return {
    zpid: String(o.zpid ?? o.id ?? ""),
    address: addressString,
    city: addr.city ?? o.city,
    state: addr.state ?? o.state,
    zip: addr.zipcode ?? addr.zip ?? o.zipcode ?? o.zip,
    price: toFiniteNumber(o.price ?? o.unformattedPrice),
    zestimate: toFiniteNumber(o.zestimate),
    rentZestimate: toFiniteNumber(o.rentZestimate),
    beds: toFiniteNumber(o.bedrooms ?? o.beds),
    baths: toFiniteNumber(o.bathrooms ?? o.baths),
    sqft: toFiniteNumber(o.livingArea ?? o.area ?? o.sqft),
    homeType: typeof o.homeType === "string" ? o.homeType : undefined,
    homeStatus: typeof o.homeStatus === "string" ? o.homeStatus : undefined,
    daysOnZillow: toFiniteNumber(o.daysOnZillow),
    imgSrc: typeof o.imgSrc === "string" ? o.imgSrc : o.image,
    detailUrl: typeof o.detailUrl === "string" ? o.detailUrl : o.url,
    lat: toFiniteNumber(o.latitude ?? o.lat),
    lng: toFiniteNumber(o.longitude ?? o.lng ?? o.lon),
    raw: o,
  };
}

function toFiniteNumber(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v.replace(/[$,]/g, ""));
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "";
  }
}
