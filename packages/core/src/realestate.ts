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

export interface MLSListingSummary {
  id: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  price?: number;
  beds?: number;
  baths?: number;
  sqft?: number;
  primaryListingImageUrl?: string;
  photosCount?: number;
  photosList?: Array<{ url: string; type?: string }>;
  daysOnMarket?: number;
  listingAgent?: { fullName?: string; phone?: string };
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
    raw: item,
  };
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
    photos,
    raw: d,
  };
}
