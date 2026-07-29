/**
 * AirROI short-term rental data client.
 *
 * https://airroi.com/api/documentation
 *
 * We use exactly one endpoint: GET /calculator/estimate — a comps-based
 * revenue projection for a specific property. Costs $0.20 per call
 * (pay-as-you-go, no contract), so it is NEVER called on the scout hot
 * path. The deal-detail page exposes an explicit "get market estimate"
 * button, the result is cached on the deal row, and subsequent scouts
 * reuse the cached figures.
 *
 * Wire details:
 *   - Auth: `x-api-key` header.
 *   - Location: `address` string OR `lat`+`lng` (mutually exclusive).
 *   - `bedrooms` (int, 0 for studios), `baths` (min 0.5, halves ok),
 *     `guests` (1..30) are required.
 *   - Response carries root-level averages plus a `percentiles` object
 *     (p25/p50/p75/p90 for revenue, ADR, occupancy), a 12-element
 *     `monthly_revenue_distributions` array (fractions of annual revenue),
 *     and the comparable listings used.
 */

export const AIRROI_BASE = "https://api.airroi.com";

export interface AirRoiClientOptions {
  apiKey: string;
  fetchFn?: typeof fetch;
  baseUrl?: string;
  /** Default 30_000 — the estimate endpoint is a fast synchronous call. */
  timeoutMs?: number;
}

export interface AirRoiEstimateRequest {
  /** Full address, e.g. "1234 Ocean Drive, Miami Beach, FL 33139". */
  address?: string;
  lat?: number;
  lng?: number;
  bedrooms: number;
  baths: number;
  guests?: number;
}

export interface AirRoiPercentiles {
  avg?: number;
  p25?: number;
  p50?: number;
  p75?: number;
  p90?: number;
}

export interface AirRoiEstimate {
  /** Expected Average Daily Rate, USD/night. */
  adr: number;
  /** Expected annual occupancy, 0..1. */
  occupancy: number;
  /** Projected annual gross revenue, USD. */
  annualRevenue: number;
  percentiles: {
    revenue?: AirRoiPercentiles;
    adr?: AirRoiPercentiles;
    occupancy?: AirRoiPercentiles;
  };
  /** 12 fractions summing to ~1: share of annual revenue per month. */
  monthlyRevenueDistribution?: number[];
  comparableCount: number;
  currency: string;
  raw?: unknown;
}

export class AirRoiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(`AirROI ${status}: ${message}`);
    this.name = "AirRoiError";
    this.status = status;
  }
}

/**
 * Sensible guest capacity when the listing doesn't tell us: two per
 * bedroom (studios sleep 2), capped at 16 — the API rejects > 30 and
 * comps degrade well before that.
 */
export function defaultGuestsForBedrooms(bedrooms: number): number {
  if (!Number.isFinite(bedrooms) || bedrooms <= 0) return 2;
  return Math.min(16, Math.round(bedrooms) * 2);
}

export class AirRoiClient {
  private apiKey: string;
  private fetchFn: typeof fetch;
  private baseUrl: string;
  private timeoutMs: number;

  constructor(opts: AirRoiClientOptions) {
    this.apiKey = opts.apiKey;
    this.fetchFn = opts.fetchFn ?? fetch;
    this.baseUrl = opts.baseUrl ?? AIRROI_BASE;
    this.timeoutMs = opts.timeoutMs ?? 30_000;
  }

  /** GET /calculator/estimate — $0.20 per call. */
  async estimateRevenue(req: AirRoiEstimateRequest): Promise<AirRoiEstimate> {
    const p = new URLSearchParams();
    if (req.address) {
      p.set("address", req.address);
    } else if (req.lat !== undefined && req.lng !== undefined) {
      p.set("lat", String(req.lat));
      p.set("lng", String(req.lng));
    } else {
      throw new Error("AirROI estimate requires address or lat+lng");
    }
    // The API requires baths >= 0.5 and guests >= 1; repair rather than 400.
    const bedrooms = Math.max(0, Math.min(20, Math.round(req.bedrooms)));
    const baths = Math.max(0.5, Math.min(20, req.baths || 1));
    const guests = Math.max(
      1,
      Math.min(30, Math.round(req.guests ?? defaultGuestsForBedrooms(bedrooms))),
    );
    p.set("bedrooms", String(bedrooms));
    p.set("baths", String(baths));
    p.set("guests", String(guests));
    p.set("currency", "usd");

    const url = `${this.baseUrl}/calculator/estimate?${p.toString()}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let res: Response;
    try {
      res = await this.fetchFn(url, {
        headers: { "x-api-key": this.apiKey },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    const text = await res.text();
    if (!res.ok) {
      throw new AirRoiError(res.status, text.slice(0, 500));
    }
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      throw new AirRoiError(res.status, `non-JSON response: ${text.slice(0, 200)}`);
    }
    return normalizeAirRoiEstimate(body);
  }
}

/**
 * Normalize the /calculator/estimate response into our shape. Throws when
 * the core figures (ADR + occupancy) are absent — a $0.20 call that
 * returns nothing usable should surface as an error, not a zeroed row.
 */
export function normalizeAirRoiEstimate(body: unknown): AirRoiEstimate {
  const o = (body && typeof body === "object" ? body : {}) as Record<
    string,
    any
  >;

  const adr = finitePositive(o.average_daily_rate);
  const occupancyRaw = finitePositive(o.occupancy);
  if (adr === undefined || occupancyRaw === undefined) {
    throw new Error(
      "AirROI estimate missing average_daily_rate / occupancy fields",
    );
  }
  // Defensive: occupancy documented as 0..1 but repair percent form.
  const occupancy = Math.min(1, occupancyRaw > 1 ? occupancyRaw / 100 : occupancyRaw);

  const pcts = (o.percentiles ?? {}) as Record<string, any>;
  const dist = Array.isArray(o.monthly_revenue_distributions)
    ? o.monthly_revenue_distributions
        .map((v: unknown) => (typeof v === "number" && isFinite(v) ? v : 0))
        .slice(0, 12)
    : undefined;

  return {
    adr,
    occupancy,
    annualRevenue: finitePositive(o.revenue) ?? adr * 365 * occupancy,
    percentiles: {
      revenue: pickPercentiles(pcts.revenue),
      adr: pickPercentiles(pcts.average_daily_rate),
      occupancy: pickPercentiles(pcts.occupancy),
    },
    monthlyRevenueDistribution: dist && dist.length === 12 ? dist : undefined,
    comparableCount: Array.isArray(o.comparable_listings)
      ? o.comparable_listings.length
      : 0,
    currency: typeof o.currency === "string" ? o.currency : "USD",
    raw: body,
  };
}

function pickPercentiles(v: unknown): AirRoiPercentiles | undefined {
  if (!v || typeof v !== "object") return undefined;
  const o = v as Record<string, any>;
  const out: AirRoiPercentiles = {};
  for (const k of ["avg", "p25", "p50", "p75", "p90"] as const) {
    const n = finitePositive(o[k]);
    if (n !== undefined) out[k] = n;
  }
  return Object.keys(out).length ? out : undefined;
}

function finitePositive(v: unknown): number | undefined {
  return typeof v === "number" && isFinite(v) && v > 0 ? v : undefined;
}
