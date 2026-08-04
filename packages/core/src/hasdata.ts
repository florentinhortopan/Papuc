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
  /** Sent as `squareFeet[min]` — the documented param. `sqft[min]` is
   *  silently ignored by the API (verified by live probe 2026-07-29). */
  sqftMin?: number;
  sqftMax?: number;
  /** Minimum/maximum year built. Sent as `yearBuilt[min]` / `yearBuilt[max]`. */
  yearBuiltMin?: number;
  yearBuiltMax?: number;
  /** Minimum lot size in sqft. Sent as `lotSize[min]`. */
  lotSizeMin?: number;
  /**
   * Maximum monthly HOA fee in USD; 0 = no-HOA listings only. Sent as
   * `hoa`. Live probe: Sacramento condos went from 5 pages to 15 total
   * results with hoa=0, so the filter bites hard.
   */
  hoaMax?: number;
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
  /** Monthly HOA fee in USD when the listing exposes it. Often absent on
   *  the listing endpoint; populated via the Property endpoint on lazy
   *  hydrate. `undefined` means unknown, `0` means confirmed-no-HOA. */
  hoaMonthly?: number;
  /** Most recent price change in USD (negative = price cut). Present on
   *  ~40% of live listing records. */
  priceChange?: number;
  /** ISO timestamp of the most recent price change. */
  priceChangedAt?: string;
  /** Lot size normalized to square feet (acres converted at 43,560). */
  lotSizeSqft?: number;
  /** Number of gallery photos on the listing record. */
  photoCount?: number;
  /** Listing has a video or 3D model tour (mediaDetails flags). */
  hasVirtualTour?: boolean;
  raw?: unknown;
}

export interface ZillowSearchResult {
  total: number;
  resultCount: number;
  data: ZillowListingSummary[];
  page?: number;
  totalPages?: number;
  /** Whether the upstream reported another page after this one. */
  hasNextPage?: boolean;
  /** Set by searchZillowAll: how many pages were actually fetched. */
  pagesFetched?: number;
  raw?: unknown;
}

/**
 * Result of /scrape/zillow/property — the per-listing detail page.
 * The big win over the Listing API is `photos`: the full photo set
 * Zillow displays in the gallery (10–50 photos), vs. the single cover
 * image you get on Listing.
 */
export interface ZillowPropertyDetail {
  /** Zillow property id (string for db storage). */
  zpid: string;
  url: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  price?: number;
  zestimate?: number;
  rentZestimate?: number;
  beds?: number;
  baths?: number;
  sqft?: number;
  yearBuilt?: number;
  homeType?: string;
  homeStatus?: string;
  /** Ordered list of photo URLs as Zillow displays them. */
  photos: string[];
  description?: string;
  lat?: number;
  lng?: number;
  /** Monthly HOA fee in USD. `undefined` means unknown, `0` means
   *  confirmed-no-HOA. Zillow Property pages almost always include this
   *  when an HOA exists. */
  hoaMonthly?: number;
  /** Actual property tax rate as an annual fraction of value (e.g. 0.0198
   *  for 1.98%), from Zillow's `propertyTaxRate` or derived from the
   *  annual tax amount. `undefined` when the payload has neither. */
  propertyTaxRatePct?: number;
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
   * Fetch full Zillow property detail (including the gallery photo set)
   * via /scrape/zillow/property. Costs 5 credits per call. Pass the full
   * Zillow URL — `zpid` alone is not accepted by the upstream endpoint.
   *
   * Throws HasDataError on non-2xx or if `requestMetadata.status` is not
   * "ok". Caller is expected to cache the result; we never pre-fetch in
   * the scout hot path.
   */
  async getZillowProperty(zillowUrl: string): Promise<ZillowPropertyDetail> {
    if (!zillowUrl || !/^https?:\/\//i.test(zillowUrl)) {
      throw new Error("getZillowProperty: zillowUrl must be a full http(s) URL");
    }
    const params = new URLSearchParams({ url: zillowUrl });
    const url = `${this.baseUrl}/scrape/zillow/property?${params.toString()}`;

    const raw = await this.requestGet<{
      requestMetadata?: { status?: string; id?: string; url?: string };
      property?: unknown;
      [k: string]: unknown;
    }>(url);

    const status = raw.requestMetadata?.status;
    if (status && status !== "ok") {
      throw new HasDataError(
        200,
        `requestMetadata.status=${status} id=${raw.requestMetadata?.id ?? "?"}`,
      );
    }

    return normalizeZillowProperty(raw.property ?? raw, zillowUrl);
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
      pagination?: {
        currentPage?: number;
        totalPages?: number;
        totalCount?: number;
        nextPage?: string;
        otherPages?: Record<string, string>;
      };
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

    // HasData's live responses don't include totalPages/totalCount — they
    // expose `nextPage` (URL) and `otherPages` ({"2": url, "3": url, ...}).
    // Derive a page count from those so callers can paginate reliably.
    const pag = raw.pagination ?? {};
    const otherPageNums = pag.otherPages
      ? Object.keys(pag.otherPages)
          .map(Number)
          .filter((n) => Number.isFinite(n))
      : [];
    const currentPage = pag.currentPage ?? filters.page ?? 1;
    const totalPages =
      pag.totalPages ??
      (otherPageNums.length
        ? Math.max(...otherPageNums, currentPage)
        : undefined);

    return {
      total: pag.totalCount ?? data.length,
      resultCount: data.length,
      page: currentPage,
      totalPages,
      hasNextPage: Boolean(pag.nextPage),
      data,
      raw,
    };
  }

  /**
   * Fetch multiple pages of /scrape/zillow/listing and aggregate, de-duped
   * by zpid. HasData sorts listings newest-first (~41 per page), so a
   * single-page fetch systematically misses anything older than a few
   * weeks in active markets — this was the root cause of "the app didn't
   * find a listing that's clearly on Zillow" (it was sitting on page 2).
   *
   * Stops when any of these hits:
   *   - `maxPages` fetched (default 3; each page costs 5 credits)
   *   - `targetCount` unique listings collected
   *   - the upstream reports no next page, or returns an empty page
   */
  async searchZillowAll(
    filters: ZillowSearchFilters,
    opts: { maxPages?: number; targetCount?: number } = {},
  ): Promise<ZillowSearchResult> {
    const maxPages = Math.max(1, opts.maxPages ?? 3);
    const targetCount = opts.targetCount ?? Number.POSITIVE_INFINITY;

    const seen = new Set<string>();
    const data: ZillowListingSummary[] = [];
    let page = filters.page ?? 1;
    let last: ZillowSearchResult | null = null;
    let pagesFetched = 0;

    for (let i = 0; i < maxPages; i++) {
      const res = await this.searchZillow({ ...filters, page });
      pagesFetched += 1;
      last = res;
      for (const row of res.data) {
        if (!seen.has(row.zpid)) {
          seen.add(row.zpid);
          data.push(row);
        }
      }
      if (data.length >= targetCount) break;
      if (res.resultCount === 0) break;
      const more =
        res.hasNextPage ??
        (res.totalPages !== undefined && page < res.totalPages);
      if (!more) break;
      page += 1;
    }

    return {
      total: last?.total ?? data.length,
      resultCount: data.length,
      data,
      page: filters.page ?? 1,
      totalPages: last?.totalPages,
      hasNextPage: last?.hasNextPage,
      pagesFetched,
      raw: last?.raw,
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
  // NOTE: the documented (and only working) sqft keys are squareFeet[...],
  // not sqft[...]. Verified by live probe: sqft[min]=100000 returned the
  // full unfiltered result set; squareFeet[min]=100000 returned zero.
  if (filters.sqftMin !== undefined) p.set("squareFeet[min]", String(filters.sqftMin));
  if (filters.sqftMax !== undefined) p.set("squareFeet[max]", String(filters.sqftMax));
  if (filters.yearBuiltMin !== undefined)
    p.set("yearBuilt[min]", String(filters.yearBuiltMin));
  if (filters.yearBuiltMax !== undefined)
    p.set("yearBuilt[max]", String(filters.yearBuiltMax));
  if (filters.lotSizeMin !== undefined)
    p.set("lotSize[min]", String(filters.lotSizeMin));
  if (filters.hoaMax !== undefined) p.set("hoa", String(filters.hoaMax));
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

  return {
    zpid: String(o.zpid ?? o.id ?? ""),
    address: extractZillowAddress(o),
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
    homeStatus:
      typeof o.homeStatus === "string"
        ? o.homeStatus
        : typeof o.status === "string"
          ? o.status
          : undefined,
    daysOnZillow: toFiniteNumber(o.daysOnZillow),
    imgSrc: typeof o.imgSrc === "string" ? o.imgSrc : o.image,
    detailUrl: typeof o.detailUrl === "string" ? o.detailUrl : o.url,
    lat: toFiniteNumber(o.latitude ?? o.lat),
    lng: toFiniteNumber(o.longitude ?? o.lng ?? o.lon),
    hoaMonthly: extractHoaMonthly(o),
    priceChange: toFiniteNumber(o.priceChange),
    priceChangedAt: extractPriceChangedAt(o),
    lotSizeSqft: extractLotSizeSqft(o),
    photoCount: Array.isArray(o.photos)
      ? o.photos.length
      : typeof o.imgSrc === "string" || typeof o.image === "string"
        ? 1
        : undefined,
    hasVirtualTour: extractHasVirtualTour(o),
    raw: o,
  };
}

/**
 * Street address across HasData response variants. The `address` object's
 * street key has already changed once in the wild (`streetAddress` →
 * `street`, observed 2026-07-29, which nulled every scouted address).
 * Property-detail payloads also nest `addressRaw` inside `address`.
 * Finish with a Zillow URL slug parse so we never persist a blank street
 * when the listing URL still encodes one.
 */
export function extractZillowAddress(o: Record<string, any>): string | undefined {
  if (typeof o.address === "string" && o.address.trim()) {
    return o.address.trim();
  }
  const addr =
    typeof o.address === "object" && o.address !== null
      ? (o.address as Record<string, any>)
      : {};
  const candidate =
    addr.streetAddress ??
    addr.street ??
    addr.line1 ??
    addr.address1 ??
    addr.address ??
    addr.addressRaw ??
    o.streetAddress ??
    o.street;
  if (typeof candidate === "string" && candidate.trim()) {
    return candidate.trim();
  }
  if (typeof o.addressRaw === "string" && o.addressRaw.trim()) {
    return o.addressRaw.trim();
  }
  return streetFromZillowUrl(
    typeof o.url === "string"
      ? o.url
      : typeof o.detailUrl === "string"
        ? o.detailUrl
        : undefined,
  );
}

/**
 * Recover a display address from a Zillow homedetails URL slug, e.g.
 * `/homedetails/302-El-Paso-St-Austin-TX-78704/63838278_zpid/` →
 * `"302 El Paso St Austin TX 78704"`. Better than "Address pending".
 */
export function streetFromZillowUrl(
  url: string | null | undefined,
): string | undefined {
  if (!url || typeof url !== "string") return undefined;
  const m = url.match(/\/homedetails\/([^/?#]+)\/\d+_zpid\/?/i);
  if (!m?.[1]) return undefined;
  const decoded = decodeURIComponent(m[1]).replace(/-/g, " ").trim();
  return decoded || undefined;
}

/**
 * Prefer the ISO string HasData provides (`priceChangedAtIso`); fall back
 * to converting the epoch-millis `priceChangedAt` field.
 */
function extractPriceChangedAt(o: Record<string, any>): string | undefined {
  if (typeof o.priceChangedAtIso === "string" && o.priceChangedAtIso) {
    return o.priceChangedAtIso;
  }
  const ms = toFiniteNumber(o.priceChangedAt);
  if (ms !== undefined && ms > 0) {
    try {
      return new Date(ms).toISOString();
    } catch {
      return undefined;
    }
  }
  return undefined;
}

const SQFT_PER_ACRE = 43_560;

/**
 * Normalize `lotAreaValue` + `lotAreaUnits` to square feet. Live records
 * use "acres" or "sqft" (sometimes "Square Feet"); legacy/variant records
 * sometimes ship a combined string like "2.5 acres" instead. When no units
 * can be found anywhere, disambiguate by magnitude: no US lot is under
 * 100 sqft, so a bare value below 100 (e.g. 2.5 on a 2.5-acre parcel) is
 * acreage; anything larger is assumed to already be sqft.
 */
export function extractLotSizeSqft(o: Record<string, any>): number | undefined {
  const raw = o.lotAreaValue ?? o.lotSize;
  const value =
    toFiniteNumber(raw) ??
    (typeof raw === "string"
      ? toFiniteNumber(raw.replace(/[^\d.]/g, ""))
      : undefined);
  if (value === undefined || value <= 0) return undefined;
  const embeddedUnits =
    typeof raw === "string" ? raw.replace(/[\d.,\s]/g, "") : "";
  const units = String(o.lotAreaUnits ?? embeddedUnits).toLowerCase();
  if (units.startsWith("acre")) return Math.round(value * SQFT_PER_ACRE);
  if (units === "" && value < 100) return Math.round(value * SQFT_PER_ACRE);
  return Math.round(value);
}

function extractHasVirtualTour(o: Record<string, any>): boolean | undefined {
  const md = o.mediaDetails;
  if (!md || typeof md !== "object") return undefined;
  const m = md as Record<string, any>;
  if (typeof m.has3DModel !== "boolean" && typeof m.hasVideo !== "boolean") {
    return undefined;
  }
  return Boolean(m.has3DModel) || Boolean(m.hasVideo);
}

/**
 * Defensively extract photo URLs from a Zillow property payload. Zillow
 * (and HasData's scraper) returns photos under several different shapes
 * across listing types. We try them in order of richness and de-dupe.
 *
 * Known shapes:
 *   - `photos: [{ url, caption?, mixedSources? }]`        (most common)
 *   - `images: ["https://...", ...]`                       (string[])
 *   - `originalPhotos: [{ mixedSources: { jpeg: [{url,width}] } }]`  (legacy)
 *   - `imgSrc`                                              (cover only)
 */
export function extractZillowPhotos(o: Record<string, any>): string[] {
  const out: string[] = [];

  const photos = o.photos;
  if (Array.isArray(photos)) {
    for (const p of photos) {
      const url = pickPhotoUrl(p);
      if (url) out.push(url);
    }
  }

  if (out.length === 0 && Array.isArray(o.images)) {
    for (const url of o.images) {
      if (typeof url === "string") out.push(url);
    }
  }

  if (out.length === 0 && Array.isArray(o.originalPhotos)) {
    for (const p of o.originalPhotos) {
      const url = pickPhotoUrl(p);
      if (url) out.push(url);
    }
  }

  if (out.length === 0 && typeof o.imgSrc === "string") {
    out.push(o.imgSrc);
  }

  const seen = new Set<string>();
  return out.filter((u) => (seen.has(u) ? false : (seen.add(u), true)));
}

function pickPhotoUrl(p: unknown): string | undefined {
  if (typeof p === "string") return p;
  if (!p || typeof p !== "object") return undefined;
  const o = p as Record<string, any>;
  if (typeof o.url === "string") return o.url;
  if (typeof o.src === "string") return o.src;
  const mixed = o.mixedSources;
  if (mixed && typeof mixed === "object") {
    const jpegs = (mixed as Record<string, any>).jpeg;
    if (Array.isArray(jpegs) && jpegs.length) {
      const best = jpegs.reduce(
        (a: Record<string, any>, b: Record<string, any>) =>
          (Number(b?.width) || 0) > (Number(a?.width) || 0) ? b : a,
        jpegs[0],
      );
      if (typeof best?.url === "string") return best.url;
    }
    const webp = (mixed as Record<string, any>).webp;
    if (Array.isArray(webp) && webp.length && typeof webp[0]?.url === "string") {
      return webp[0].url;
    }
  }
  return undefined;
}

export function normalizeZillowProperty(
  raw: unknown,
  fallbackUrl: string,
): ZillowPropertyDetail {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, any>;
  const addr = typeof o.address === "object" && o.address !== null ? o.address : {};

  return {
    zpid: String(o.zpid ?? o.id ?? ""),
    url: typeof o.url === "string" ? o.url : fallbackUrl,
    address: extractZillowAddress(o),
    city: addr.city ?? o.city,
    state: addr.state ?? o.state,
    zip: addr.zipcode ?? addr.zip ?? o.zipcode ?? o.zip,
    price: toFiniteNumber(o.price ?? o.unformattedPrice),
    zestimate: toFiniteNumber(o.zestimate),
    rentZestimate: toFiniteNumber(o.rentZestimate),
    beds: toFiniteNumber(o.bedrooms ?? o.beds),
    baths: toFiniteNumber(o.bathrooms ?? o.baths),
    sqft: toFiniteNumber(o.livingArea ?? o.sqft),
    yearBuilt: toFiniteNumber(o.yearBuilt),
    homeType: typeof o.homeType === "string" ? o.homeType : undefined,
    homeStatus:
      typeof o.homeStatus === "string"
        ? o.homeStatus
        : typeof o.status === "string"
          ? o.status
          : undefined,
    photos: extractZillowPhotos(o),
    description: typeof o.description === "string" ? o.description : undefined,
    lat: toFiniteNumber(o.latitude ?? o.lat),
    lng: toFiniteNumber(o.longitude ?? o.lng ?? o.lon),
    hoaMonthly: extractHoaMonthly(o),
    propertyTaxRatePct: extractPropertyTaxRate(o),
    raw: o,
  };
}

/**
 * Pull the property's actual tax rate from a Zillow property payload.
 * Zillow exposes `propertyTaxRate` as a percentage (e.g. `1.98` = 1.98%/yr)
 * on most property pages; when absent we derive it from the annual tax
 * amount ÷ price. Returns an annual decimal fraction (0.0198), or
 * `undefined` when neither source is usable. Sanity bounds guard against
 * unit confusion (no US property taxes at 10%+ of value or below 0.05%).
 */
export function extractPropertyTaxRate(
  o: Record<string, any>,
): number | undefined {
  const reso =
    o.resoFacts && typeof o.resoFacts === "object"
      ? (o.resoFacts as Record<string, any>)
      : {};

  const ratePercent = toFiniteNumber(o.propertyTaxRate ?? reso.propertyTaxRate);
  if (ratePercent !== undefined && ratePercent > 0.05 && ratePercent < 10) {
    return ratePercent / 100;
  }

  const taxAnnual = toFiniteNumber(o.taxAnnualAmount ?? reso.taxAnnualAmount);
  const price = toFiniteNumber(o.price ?? o.zestimate ?? o.unformattedPrice);
  if (taxAnnual !== undefined && taxAnnual > 0 && price && price > 0) {
    const rate = taxAnnual / price;
    if (rate >= 0.0005 && rate < 0.1) return rate;
  }

  return undefined;
}

/**
 * Defensively pull a monthly HOA fee from a Zillow record. Zillow puts
 * this in several different places depending on listing type / data
 * completeness — single-family detached usually has no HOA at all,
 * condos/townhomes/HOA-governed developments do.
 *
 * Field paths we check (in order):
 *   - top-level `monthlyHoaFee` (newer Zillow listing+property payloads)
 *   - top-level `hoaFee` (string like "$250/month" or number)
 *   - `resoFacts.hoaFee` + `resoFacts.hoaFeeFrequency`
 *   - `hdpData.homeInfo.monthlyHoaFee`
 *
 * Returns:
 *   - a positive number for "HOA is $N/month"
 *   - `0` for "no HOA" (e.g. `hasAssociation === false`)
 *   - `undefined` for "unknown / not in the payload"
 */
export function extractHoaMonthly(o: Record<string, any>): number | undefined {
  const direct = toFiniteNumber(o.monthlyHoaFee);
  if (direct !== undefined) return direct;

  const hoaFee = o.hoaFee;
  if (typeof hoaFee === "number" && Number.isFinite(hoaFee)) {
    const freq = String(o.hoaFeeFrequency ?? "monthly").toLowerCase();
    return normalizeHoaToMonthly(hoaFee, freq);
  }
  if (typeof hoaFee === "string") {
    const parsed = parseHoaFeeString(hoaFee);
    if (parsed !== undefined) return parsed;
  }

  const reso = o.resoFacts;
  if (reso && typeof reso === "object") {
    const r = reso as Record<string, any>;
    const v = toFiniteNumber(r.monthlyHoaFee ?? r.hoaFee);
    if (v !== undefined) {
      const freq = String(r.hoaFeeFrequency ?? "monthly").toLowerCase();
      return normalizeHoaToMonthly(v, freq);
    }
  }

  const hdp = o.hdpData;
  if (hdp && typeof hdp === "object") {
    const info = (hdp as Record<string, any>).homeInfo;
    if (info && typeof info === "object") {
      const v = toFiniteNumber(
        (info as Record<string, any>).monthlyHoaFee ??
          (info as Record<string, any>).hoaFee,
      );
      if (v !== undefined) return v;
    }
  }

  // Last resort: explicit "no association" flag.
  if (o.hasAssociation === false) return 0;

  return undefined;
}

function normalizeHoaToMonthly(value: number, frequency: string): number {
  if (frequency.startsWith("year") || frequency === "annually") return value / 12;
  if (frequency.startsWith("quarter")) return value / 3;
  if (frequency.startsWith("week")) return value * 52 / 12;
  // Default: monthly.
  return value;
}

function parseHoaFeeString(s: string): number | undefined {
  const lower = s.toLowerCase().trim();
  if (!lower || lower === "none" || lower === "n/a" || lower === "no hoa") {
    return 0;
  }
  const n = Number(s.replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(n)) return undefined;
  if (/year|annual|annually|yr|yearly/.test(lower)) return n / 12;
  if (/quarter|quarterly/.test(lower)) return n / 3;
  if (/week|weekly/.test(lower)) return (n * 52) / 12;
  return n;
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
