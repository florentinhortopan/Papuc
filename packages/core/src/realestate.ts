export const REALESTATE_API_BASE = "https://api.realestateapi.com/v2";

export interface RealEstateAPIClientOptions {
  apiKey: string;
  fetchFn?: typeof fetch;
  baseUrl?: string;
  maxRetries?: number;
}

export interface MLSSearchFilters {
  city?: string;
  state?: string;
  zip?: string;
  polygon?: Array<[number, number]>;
  mls_listing_price_min?: number;
  mls_listing_price_max?: number;
  beds_min?: number;
  baths_min?: number;
  sqft_min?: number;
  property_type?: string[];
  status?: "active" | "pending" | "sold";
  size?: number;
  resultIndex?: number;
}

/**
 * Filters for /PropertySearch — the property-records endpoint.
 *
 * PAYG plans on RealEstateAPI cannot call /MLSSearch (the MLS-feed endpoint),
 * but /PropertySearch is wallet-eligible. PropertySearch returns property
 * records (assessor data + AVM + suggested rent), with optional embedded MLS
 * fields when available. Price filtering uses AVM (`value_min/max`) since
 * `mls_listing_price_*` only matches currently-listed properties and may be
 * gated under PAYG.
 */
export interface PropertySearchFilters {
  city?: string;
  state?: string;
  zip?: string;
  polygon?: Array<[number, number]>;
  /** AVM lower bound (estimatedValue), used when MLS price filters are gated. */
  value_min?: number;
  value_max?: number;
  beds_min?: number;
  baths_min?: number;
  building_size_min?: number;
  year_built_min?: number;
  property_type?: string[];
  /**
   * If true, restricts to currently-listed MLS properties. May trigger a
   * wallet error on PAYG; caller should be prepared to retry without it.
   */
  mls_active?: boolean;
  absentee_owner?: boolean;
  size?: number;
  resultIndex?: number;
}

export interface MLSListingSummary {
  id: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  /**
   * Active MLS listing price. Only set when the property is currently for
   * sale. For off-market candidates from /PropertySearch this is undefined;
   * use `estimatedValue` (AVM) as a proxy for acquisition price.
   */
  price?: number;
  /** Lender-grade AVM (RealEstateAPI estimated market value). */
  estimatedValue?: number;
  beds?: number;
  baths?: number;
  sqft?: number;
  primaryListingImageUrl?: string;
  photosCount?: number;
  photosList?: Array<{ url: string; type?: string }>;
  daysOnMarket?: number;
  listingAgent?: { fullName?: string; phone?: string };
  /** Monthly HOA fee in USD when the MLS / property record exposes it.
   *  `undefined` means unknown, `0` means confirmed-no-HOA. */
  hoaMonthly?: number;
  raw?: unknown;
}

export interface MLSSearchResult {
  total: number;
  resultCount: number;
  data: MLSListingSummary[];
  raw?: unknown;
}

export interface PropertyDetail {
  id: string;
  address?: string;
  estimatedValue?: number;
  estimatedMortgagePayment?: number;
  suggestedRent?: number;
  hudFairMarketRent?: Record<string, number>;
  beds?: number;
  baths?: number;
  sqft?: number;
  yearBuilt?: number;
  propertyType?: string;
  lat?: number;
  lng?: number;
  /** Monthly HOA fee in USD. `undefined` means unknown, `0` means
   *  confirmed-no-HOA. */
  hoaMonthly?: number;
  photos?: string[];
  raw?: unknown;
}

export class RealEstateAPIClient {
  private apiKey: string;
  private fetchFn: typeof fetch;
  private baseUrl: string;
  private maxRetries: number;

  constructor(opts: RealEstateAPIClientOptions) {
    this.apiKey = opts.apiKey;
    this.fetchFn = opts.fetchFn ?? fetch;
    this.baseUrl = opts.baseUrl ?? REALESTATE_API_BASE;
    this.maxRetries = opts.maxRetries ?? 3;
  }

  private async request<T>(path: string, body: unknown): Promise<T> {
    let lastErr: unknown;
    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        const res = await this.fetchFn(`${this.baseUrl}${path}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": this.apiKey,
            "x-user-id": "papuc-app",
          },
          body: JSON.stringify(body),
        });
        if (res.status === 429 || res.status >= 500) {
          const wait = Math.min(2 ** attempt * 250, 4000);
          await new Promise((r) => setTimeout(r, wait));
          continue;
        }
        if (!res.ok) {
          const text = await res.text();
          throw new RealEstateAPIError(res.status, text);
        }
        return (await res.json()) as T;
      } catch (err) {
        lastErr = err;
        if (attempt === this.maxRetries - 1) throw err;
        await new Promise((r) => setTimeout(r, 2 ** attempt * 250));
      }
    }
    throw lastErr ?? new Error("RealEstateAPI request failed");
  }

  /**
   * Search property records via /PropertySearch (PAYG-eligible).
   *
   * Returned `MLSListingSummary.price` prefers `mlsListingPrice` if present,
   * else `estimatedValue` (AVM). Photos come from the single `imageUrl` field
   * (PropertyDetail returns the full photo list).
   */
  async propertySearch(
    filters: PropertySearchFilters,
  ): Promise<MLSSearchResult> {
    const body: Record<string, unknown> = {
      size: filters.size ?? 25,
      resultIndex: filters.resultIndex ?? 0,
    };
    if (filters.city) body.city = filters.city;
    if (filters.state) body.state = filters.state;
    if (filters.zip) body.zip = filters.zip;
    if (filters.polygon) body.polygon = filters.polygon;
    if (filters.value_min !== undefined) body.value_min = filters.value_min;
    if (filters.value_max !== undefined) body.value_max = filters.value_max;
    if (filters.beds_min !== undefined) body.beds_min = filters.beds_min;
    if (filters.baths_min !== undefined) body.baths_min = filters.baths_min;
    if (filters.building_size_min !== undefined)
      body.building_size_min = filters.building_size_min;
    if (filters.year_built_min !== undefined)
      body.year_built_min = filters.year_built_min;
    if (filters.property_type) body.property_type = filters.property_type;
    if (filters.mls_active !== undefined) body.mls_active = filters.mls_active;
    if (filters.absentee_owner !== undefined)
      body.absentee_owner = filters.absentee_owner;

    const raw = await this.request<{
      data?: unknown[];
      resultCount?: number;
      recordCount?: number;
    }>("/PropertySearch", body);
    const data = (raw.data ?? []).map((item: any) =>
      normalizePropertyRecord(item),
    );
    return {
      total: raw.recordCount ?? raw.resultCount ?? data.length,
      resultCount: data.length,
      data,
      raw,
    };
  }

  async mlsSearch(filters: MLSSearchFilters): Promise<MLSSearchResult> {
    const body: Record<string, unknown> = {
      size: filters.size ?? 25,
      resultIndex: filters.resultIndex ?? 0,
    };
    if (filters.city) body.city = filters.city;
    if (filters.state) body.state = filters.state;
    if (filters.zip) body.zip = filters.zip;
    if (filters.polygon) body.polygon = filters.polygon;
    if (filters.mls_listing_price_min !== undefined)
      body.mls_listing_price_min = filters.mls_listing_price_min;
    if (filters.mls_listing_price_max !== undefined)
      body.mls_listing_price_max = filters.mls_listing_price_max;
    if (filters.beds_min !== undefined) body.beds_min = filters.beds_min;
    if (filters.baths_min !== undefined) body.baths_min = filters.baths_min;
    if (filters.sqft_min !== undefined) body.sqft_min = filters.sqft_min;
    if (filters.property_type) body.property_type = filters.property_type;
    body.status = filters.status ?? "active";

    const raw = await this.request<{ data?: unknown[]; resultCount?: number; recordCount?: number }>(
      "/MLSSearch",
      body,
    );
    const data = (raw.data ?? []).map((item: any) => normalizeListing(item));
    return {
      total: raw.recordCount ?? raw.resultCount ?? data.length,
      resultCount: data.length,
      data,
      raw,
    };
  }

  async propertyDetail(id: string): Promise<PropertyDetail> {
    const raw = await this.request<{ data?: any }>("/PropertyDetail", { id });
    return normalizeDetail(raw.data ?? raw);
  }

  async propertyDetailByAddress(address: string): Promise<PropertyDetail> {
    const raw = await this.request<{ data?: any }>("/PropertyDetail", { address });
    return normalizeDetail(raw.data ?? raw);
  }

  async autocomplete(query: string): Promise<Array<{ label: string; type: string }>> {
    const raw = await this.request<{ data?: any[] }>("/AutoComplete", { search: query });
    return (raw.data ?? []).map((d: any) => ({
      label: d.title ?? d.label ?? String(d),
      type: d.searchType ?? "unknown",
    }));
  }

  async comparables(id: string): Promise<MLSListingSummary[]> {
    const raw = await this.request<{ data?: any[] }>("/PropertyComps", { id });
    return (raw.data ?? []).map(normalizeListing);
  }
}

export class RealEstateAPIError extends Error {
  constructor(
    public status: number,
    public body: string,
  ) {
    super(`RealEstateAPI ${status}: ${body.slice(0, 200)}`);
  }
}

function normalizeListing(item: any): MLSListingSummary {
  const m = item.mlsListing ?? item;
  const media = m.media ?? item.media ?? {};
  return {
    id: String(item.id ?? item.propertyId ?? m.listingId ?? ""),
    address: item.address?.fullAddress ?? item.address ?? m.address?.fullAddress,
    city: item.address?.city ?? m.address?.city,
    state: item.address?.state ?? m.address?.state,
    zip: item.address?.zip ?? m.address?.zip,
    price: item.price ?? m.listingPrice,
    beds: item.beds ?? m.bedrooms,
    baths: item.baths ?? m.bathrooms,
    sqft: item.sqft ?? m.squareFeet,
    primaryListingImageUrl: media.primaryListingImageUrl,
    photosCount: media.photosCount,
    photosList: media.photosList,
    daysOnMarket: item.daysOnMarket ?? m.daysOnMarket,
    listingAgent: m.listingAgent,
    hoaMonthly: extractRealEstateHoa(item),
    raw: item,
  };
}

/**
 * Normalize a /PropertySearch row into the shared MLSListingSummary shape so
 * the scout pipeline can stay endpoint-agnostic. Keeps `price` (MLS listing
 * price) and `estimatedValue` (AVM) strictly separate so callers can tell
 * active listings apart from off-market candidates.
 */
function normalizePropertyRecord(item: any): MLSListingSummary {
  const addr = item.address ?? {};
  const mlsPrice = toFiniteNumber(item.mlsListingPrice);
  const avm = toFiniteNumber(item.estimatedValue);
  const imageUrl: string | undefined = item.imageUrl;
  return {
    id: String(item.id ?? item.propertyId ?? ""),
    address: addr.address ?? addr.street ?? undefined,
    city: addr.city,
    state: addr.state,
    zip: addr.zip,
    price: mlsPrice && mlsPrice > 0 ? mlsPrice : undefined,
    estimatedValue: avm,
    beds: toFiniteNumber(item.bedrooms),
    baths: toFiniteNumber(item.bathrooms),
    sqft: toFiniteNumber(item.squareFeet),
    primaryListingImageUrl: imageUrl,
    photosCount: imageUrl ? 1 : 0,
    photosList: imageUrl ? [{ url: imageUrl }] : undefined,
    daysOnMarket: toFiniteNumber(item.mlsDaysOnMarket),
    listingAgent: undefined,
    hoaMonthly: extractRealEstateHoa(item),
    raw: item,
  };
}

/**
 * Pull a monthly HOA fee out of a RealEstateAPI payload (PropertySearch
 * row, MLSSearch row, or PropertyDetail). MLS records expose this most
 * reliably; off-market property records rarely have it.
 *
 * Field paths checked:
 *   - top-level `hoaFee` / `monthlyHoaFee` / `hoa.monthlyHoaFee`
 *   - `mlsListing.hoaFee` / `mlsListing.hoaFeeFrequency`
 *   - `propertyInfo.hoaFee` / `propertyInfo.monthlyHoaFee`
 */
export function extractRealEstateHoa(o: Record<string, any>): number | undefined {
  const direct = toFiniteNumber(o.monthlyHoaFee);
  if (direct !== undefined) return direct;

  const hoaObj = o.hoa;
  if (hoaObj && typeof hoaObj === "object") {
    const v = toFiniteNumber((hoaObj as any).monthlyHoaFee ?? (hoaObj as any).hoaFee);
    if (v !== undefined) {
      const freq = String((hoaObj as any).hoaFeeFrequency ?? "monthly").toLowerCase();
      return hoaToMonthly(v, freq);
    }
  }

  const mls = o.mlsListing;
  if (mls && typeof mls === "object") {
    const v = toFiniteNumber((mls as any).hoaFee ?? (mls as any).monthlyHoaFee);
    if (v !== undefined) {
      const freq = String((mls as any).hoaFeeFrequency ?? "monthly").toLowerCase();
      return hoaToMonthly(v, freq);
    }
  }

  const info = o.propertyInfo;
  if (info && typeof info === "object") {
    const v = toFiniteNumber((info as any).monthlyHoaFee ?? (info as any).hoaFee);
    if (v !== undefined) {
      const freq = String((info as any).hoaFeeFrequency ?? "monthly").toLowerCase();
      return hoaToMonthly(v, freq);
    }
    if ((info as any).hasHoa === false) return 0;
  }

  const flat = toFiniteNumber(o.hoaFee);
  if (flat !== undefined) {
    const freq = String(o.hoaFeeFrequency ?? "monthly").toLowerCase();
    return hoaToMonthly(flat, freq);
  }

  return undefined;
}

function hoaToMonthly(value: number, frequency: string): number {
  if (frequency.startsWith("year") || frequency === "annually") return value / 12;
  if (frequency.startsWith("quarter")) return value / 3;
  if (frequency.startsWith("week")) return (value * 52) / 12;
  return value;
}

function toFiniteNumber(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

function normalizeDetail(d: any): PropertyDetail {
  const propertyInfo = d.propertyInfo ?? {};
  const fmr = d.demographics?.fmrData ?? d.hudFmr ?? undefined;
  const photos: string[] | undefined = d.media?.photosList?.map((p: any) =>
    typeof p === "string" ? p : p.url,
  );
  return {
    id: String(d.id ?? d.propertyId ?? ""),
    address: d.address?.fullAddress ?? d.propertyAddress?.fullAddress,
    estimatedValue: d.estimatedValue ?? d.avm?.value,
    estimatedMortgagePayment: d.estimatedMortgagePayment,
    suggestedRent:
      d.demographics?.suggestedRent !== undefined
        ? Number(d.demographics.suggestedRent)
        : d.suggestedRent,
    hudFairMarketRent: fmr,
    beds: propertyInfo.bedroomsCount ?? d.beds,
    baths: propertyInfo.bathroomsCount ?? d.baths,
    sqft: propertyInfo.livingSquareFeet ?? d.sqft,
    yearBuilt: propertyInfo.yearBuilt,
    propertyType: propertyInfo.propertyType ?? d.propertyType,
    lat: d.propertyAddress?.latitude ?? d.lat,
    lng: d.propertyAddress?.longitude ?? d.lng,
    hoaMonthly: extractRealEstateHoa(d),
    photos,
    raw: d,
  };
}
