import {
  computeAutoPMIRateFromLoan,
  computeProForma,
  estimateInsuranceMonthly,
  estimateSTRAdrFromLTRRent,
  HasDataClient,
  RealEstateAPIClient,
  type Market,
  type MLSListingSummary,
  type ProjectConstraints,
  type PropertyDetail,
  type PropertySearchFilters,
  type ZillowListingSummary,
  type ZillowSearchFilters,
} from "@papuc/core";
import type { SupabaseClient } from "@supabase/supabase-js";

const MAX_HYDRATE_PARALLEL = 5;
/**
 * Default monthly cashflow floor for scout filtering when the project has
 * no explicit targetMonthlyCashflow. Anything worse than this is dropped
 * even if the DSCR check would have let it through, because deeply
 * negative deals just clutter the portfolio. -300 = "break-even with a
 * little wiggle for soft months".
 */
const DEFAULT_MIN_CASHFLOW = -300;

type CandidateSource = "hasdata" | "realestateapi";

interface ScoutCandidate {
  listing: MLSListingSummary;
  detail: PropertyDetail | null;
  source: CandidateSource;
  /** Canonical URL on the source provider, when it returned a deep link. */
  sourceUrl: string | null;
}

interface ProviderSearchResult {
  candidates: ScoutCandidate[];
  /** Resolved query payload echoed back for debugging. */
  query: Record<string, unknown>;
  /** First raw record off the wire, for shape verification. */
  firstSample: Record<string, unknown> | null;
}

export interface ScoutDiagnostics {
  /** Provider actually used. */
  provider: CandidateSource;
  /** Where each dropped candidate fell out of the funnel. */
  dropped: {
    noId: number;
    noPrice: number;
    dscrTooLow: number;
    cashflowTooLow: number;
    upsertFailed: number;
  };
  /** A redacted peek at the first raw provider record — useful when 0 results
   *  to verify the upstream is returning what we expect. */
  firstSample: Record<string, unknown> | null;
  /** Last upsert error string, if any. */
  lastUpsertError: string | null;
  /** Resolved keyword/filters sent to the provider, for easy reproduction. */
  query: Record<string, unknown>;
}

export interface ScoutResult {
  scoutRunId: string;
  candidatesSeen: number;
  dealsAdded: number;
  dealsScored: number;
  elapsedMs: number;
  diagnostics: ScoutDiagnostics;
}

/**
 * Map a project's constraints to a real-estate provider, hydrate each
 * candidate, compute pro-forma, persist deals + deal_scores. Service-role
 * client required so background runs (cron) bypass RLS while still scoping
 * by `owner_id`.
 *
 * Provider selection (in order of preference):
 *   1. HasData (Zillow scraper) when HASDATA_API_KEY is set. This is the
 *      primary path: actual Zillow list prices, rentZestimate for free in
 *      the search response, no per-listing detail call required.
 *   2. RealEstateAPI /PropertySearch when REALESTATEAPI_KEY is set. This is
 *      the legacy fallback. Note that PAYG plans don't have access to
 *      /MLSSearch, so we use /PropertySearch (off-market property records
 *      with AVM pricing) and try `mls_active: true` first.
 */
export async function scoutProjectInternal(
  sb: SupabaseClient,
  projectId: string,
  options: {
    triggerKind?: "manual" | "scheduled";
    triggeredBy?: string | null;
    size?: number;
  } = {},
): Promise<ScoutResult> {
  const hasDataKey = process.env.HASDATA_API_KEY;
  const reaKey = process.env.REALESTATEAPI_KEY;
  if (!hasDataKey && !reaKey) {
    throw new Error("No real-estate provider configured: set HASDATA_API_KEY or REALESTATEAPI_KEY");
  }

  const { data: project, error: pErr } = await sb
    .from("projects")
    .select("*")
    .eq("id", projectId)
    .single();
  if (pErr || !project) throw new Error("project not found");

  const constraints = project.constraints as ProjectConstraints;

  const { data: runRow, error: runErr } = await sb
    .from("scout_runs")
    .insert({
      project_id: project.id,
      triggered_by: options.triggeredBy ?? null,
      trigger_kind: options.triggerKind ?? "manual",
    })
    .select("id")
    .single();
  if (runErr || !runRow) throw new Error("could not start scout run");

  const startedAt = Date.now();
  let candidatesSeen = 0;
  let dealsAdded = 0;
  let dealsScored = 0;

  const dropped = {
    noId: 0,
    noPrice: 0,
    dscrTooLow: 0,
    cashflowTooLow: 0,
    upsertFailed: 0,
  };
  let lastUpsertError: string | null = null;
  let providerQuery: Record<string, unknown> = {};
  let firstSample: Record<string, unknown> | null = null;
  const provider: CandidateSource = hasDataKey ? "hasdata" : "realestateapi";

  try {
    const market = constraints.markets[0];
    if (!market) throw new Error("project has no market");

    const size = options.size ?? 25;
    const search: ProviderSearchResult = hasDataKey
      ? await searchHasData(hasDataKey, constraints, market, size)
      : await searchRealEstateAPI(reaKey!, constraints, market, size);
    const candidates = search.candidates;
    providerQuery = search.query;
    firstSample = search.firstSample;
    candidatesSeen = candidates.length;

    console.log("[scout] provider=%s query=%j candidates=%d", provider, search.query, candidates.length);

    const downPayment = constraints.downPayment ?? 0;
    const targetCashflow = constraints.targetMonthlyCashflow ?? 0;

    for (const { listing, detail, source, sourceUrl } of candidates) {
      if (!listing.id) {
        dropped.noId += 1;
        continue;
      }
      const mlsPrice = listing.price;
      const avm = listing.estimatedValue ?? detail?.estimatedValue;
      const effectivePrice = mlsPrice ?? avm;
      if (!effectivePrice) {
        dropped.noPrice += 1;
        continue;
      }

      const effectiveDown =
        downPayment > 0
          ? downPayment
          : effectivePrice * (1 - constraints.mortgage.ltv);
      const monthlyRent =
        detail?.suggestedRent ??
        pickHudFmrRent(detail?.hudFairMarketRent, listing.beds ?? 3) ??
        estimateRentFromPrice(effectivePrice);

      // HOA: prefer listing-level value (free, came back on the search call)
      // and fall back to detail (paid call, only when we already had to make
      // one). `undefined` from both means the API simply did not return one.
      const hoaMonthly = listing.hoaMonthly ?? detail?.hoaMonthly;

      // For STR we estimate an Average Daily Rate from the LTR-equivalent
      // monthly rent. monthlyRent / 30 (the old behavior) treated STR like
      // a daily slice of long-term rent and dramatically under-counted
      // revenue, killing every STR deal at the cashflow filter. The
      // estimator applies a documented industry multiplier + occupancy.
      const estimatedADR =
        constraints.strategy === "STR"
          ? estimateSTRAdrFromLTRRent(monthlyRent)
          : 0;

      // Be explicit about every cost so the cashflow we store in
      // `deal_scores` matches what the deal-detail page recomputes live.
      // Without this, a $1M deal scouted with the proforma's default
      // $100/mo insurance would show a wildly rosier cashflow on the card
      // than on the detail page (which scales insurance with price).
      const proforma = computeProForma({
        price: effectivePrice,
        downPayment: effectiveDown,
        rateAPR: constraints.mortgage.rateAPR,
        termYears: constraints.mortgage.termYears,
        interestOnly: constraints.mortgage.interestOnly ?? false,
        strategy: constraints.strategy,
        monthlyRentLTR: constraints.strategy === "LTR" ? monthlyRent : 0,
        monthlyADR:
          constraints.strategy === "STR"
            ? new Array(12).fill(estimatedADR)
            : undefined,
        hoaMonthly: hoaMonthly,
        insuranceMonthly: estimateInsuranceMonthly(effectivePrice),
        pmiRatePct: computeAutoPMIRateFromLoan(effectivePrice, effectiveDown),
      });

      const monthlyCashflow = proforma.annualPreTaxProfit / 12;
      const matchesDSCR = proforma.dscr >= constraints.minDSCR;
      // If the user set a target, require at least 80% of it.
      // Otherwise apply the default floor so we don't surface deals that
      // bleed several thousand a month.
      const cashflowMin =
        targetCashflow > 0 ? targetCashflow * 0.8 : DEFAULT_MIN_CASHFLOW;
      const matchesCashflow = monthlyCashflow >= cashflowMin;
      if (!matchesDSCR) {
        dropped.dscrTooLow += 1;
        continue;
      }
      if (!matchesCashflow) {
        dropped.cashflowTooLow += 1;
        continue;
      }

      const baseScore = computeBaseScore({
        dscr: proforma.dscr,
        monthlyCashflow,
        targetCashflow,
        cashOnCash: proforma.cashOnCashReturn,
      });

      const photos =
        listing.photosList?.map((p) => p.url) ?? (detail?.photos ?? []);

      const { data: dealRow, error: dealErr } = await sb
        .from("deals")
        .upsert(
          {
            project_id: project.id,
            source,
            source_property_id: listing.id,
            address: listing.address ?? null,
            city: listing.city ?? null,
            state: listing.state ?? null,
            zip: listing.zip ?? null,
            lat: detail?.lat ?? null,
            lng: detail?.lng ?? null,
            price: mlsPrice ?? null,
            beds: listing.beds ?? detail?.beds ?? null,
            baths: listing.baths ?? detail?.baths ?? null,
            sqft: listing.sqft ?? detail?.sqft ?? null,
            photos,
            primary_image_url: listing.primaryListingImageUrl ?? null,
            source_url: sourceUrl,
            mls_data: listing.raw ?? null,
            est_value: avm ?? null,
            est_rent: monthlyRent,
            hoa_monthly: hoaMonthly ?? null,
            hud_fmr: detail?.hudFairMarketRent ?? null,
            last_refreshed_at: new Date().toISOString(),
          },
          { onConflict: "project_id,source,source_property_id" },
        )
        .select("id")
        .single();
      if (dealErr || !dealRow) {
        dropped.upsertFailed += 1;
        if (dealErr) {
          lastUpsertError = dealErr.message ?? String(dealErr);
          console.warn("[scout] deals upsert failed: %s", lastUpsertError);
        }
        continue;
      }
      dealsAdded += 1;

      const { error: scoreErr } = await sb.from("deal_scores").upsert(
        {
          deal_id: dealRow.id,
          project_id: project.id,
          dscr: round(proforma.dscr, 3),
          dscr_lender_haircut: round(proforma.dscrLenderHaircut, 3),
          cash_on_cash: round(proforma.cashOnCashReturn, 4),
          monthly_cashflow: round(monthlyCashflow, 2),
          irr_5yr: proforma.irr5Yr !== null ? round(proforma.irr5Yr, 4) : null,
          payout_years: round(proforma.payoutYears, 2),
          score: Math.round(baseScore),
          rationale: null,
          computed_proforma: proforma,
          computed_at: new Date().toISOString(),
        },
        { onConflict: "deal_id" },
      );
      if (!scoreErr) dealsScored += 1;
    }

    await sb
      .from("projects")
      .update({ last_scout_at: new Date().toISOString() })
      .eq("id", project.id);
    await sb
      .from("scout_runs")
      .update({
        finished_at: new Date().toISOString(),
        candidates_seen: candidatesSeen,
        deals_added: dealsAdded,
        deals_scored: dealsScored,
      })
      .eq("id", runRow.id);

    return {
      scoutRunId: runRow.id,
      candidatesSeen,
      dealsAdded,
      dealsScored,
      elapsedMs: Date.now() - startedAt,
      diagnostics: {
        provider,
        dropped,
        firstSample,
        lastUpsertError,
        query: providerQuery,
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[scout] failed: %s", message);
    await sb
      .from("scout_runs")
      .update({
        finished_at: new Date().toISOString(),
        error: message,
        candidates_seen: candidatesSeen,
        deals_added: dealsAdded,
        deals_scored: dealsScored,
      })
      .eq("id", runRow.id);
    throw err;
  }
}

/**
 * HasData / Zillow path. One GET per scout (no per-listing detail call).
 * The Zillow Listing API returns rentZestimate + zestimate inline, so we
 * synthesize a `PropertyDetail` from each search row to keep the rest of
 * the pipeline unchanged.
 */
async function searchHasData(
  apiKey: string,
  constraints: ProjectConstraints,
  market: Market,
  size: number,
): Promise<ProviderSearchResult> {
  const client = new HasDataClient({ apiKey });
  const filters = buildHasDataFilters(constraints, market);
  console.log("[scout/hasdata] filters=%j", filters);
  const result = await client.searchZillow(filters);
  console.log(
    "[scout/hasdata] total=%d resultCount=%d page=%s/%s",
    result.total,
    result.resultCount,
    result.page ?? "?",
    result.totalPages ?? "?",
  );

  const sliced = result.data.slice(0, size);
  const candidates = sliced.map((row) => {
    const listing = zillowToMLSListing(row);
    const detail = zillowToSyntheticDetail(row);
    return {
      listing,
      detail,
      source: "hasdata" as const,
      sourceUrl: row.detailUrl ?? null,
    };
  });

  const firstRaw = sliced[0]?.raw;
  const firstSample = firstRaw && typeof firstRaw === "object"
    ? sanitizeSample(firstRaw as Record<string, unknown>)
    : null;

  return {
    candidates,
    query: filters as unknown as Record<string, unknown>,
    firstSample,
  };
}

function buildHasDataFilters(
  constraints: ProjectConstraints,
  market: Market,
): ZillowSearchFilters {
  const filters: ZillowSearchFilters = {
    keyword: marketToZillowKeyword(market),
    type: "forSale",
  };
  if (constraints.priceMin !== undefined) filters.priceMin = constraints.priceMin;
  if (constraints.priceMax !== undefined) filters.priceMax = constraints.priceMax;
  if (constraints.bedsMin !== undefined) filters.bedsMin = constraints.bedsMin;
  if (constraints.bathsMin !== undefined) filters.bathsMin = constraints.bathsMin;
  if (constraints.sqftMin !== undefined) filters.sqftMin = constraints.sqftMin;

  if (
    constraints.propertyTypes.length &&
    !constraints.propertyTypes.includes("any")
  ) {
    const mapped = constraints.propertyTypes
      .map(mapPropertyTypeToZillow)
      .filter((t): t is string => t !== null);
    if (mapped.length) filters.homeTypes = mapped;
  }
  return filters;
}

/**
 * Zillow's Listing API takes a free-form area string as `keyword`. For
 * city markets we use "City, ST"; for zip we pass the zip code directly;
 * for county we fall back to "<County> County, ST". Polygon markets aren't
 * supported by the listing endpoint — surface a clear error rather than
 * silently returning the wrong region.
 */
function marketToZillowKeyword(market: Market): string {
  if (market.kind === "city") return `${market.city}, ${market.state}`;
  if (market.kind === "zip") return market.zip;
  if (market.kind === "county") return `${market.county} County, ${market.state}`;
  throw new Error(
    "HasData/Zillow scout does not support polygon markets — pick a city, zip, or county.",
  );
}

/**
 * Map our internal PropertyType enum to HasData/Zillow's homeTypes enum.
 * HasData accepts only this set (validated server-side, 422 otherwise):
 *   house | townhome | multiFamily | condo | lot | apartment | manufactured
 */
function mapPropertyTypeToZillow(t: string): string | null {
  switch (t) {
    case "single_family":
      return "house";
    case "condo":
      return "condo";
    case "townhouse":
      return "townhome";
    case "multi_family_2_4":
      return "multiFamily";
    case "multi_family_5_plus":
      return "apartment";
    default:
      return null;
  }
}

function zillowToMLSListing(row: ZillowListingSummary): MLSListingSummary {
  return {
    id: row.zpid,
    address: row.address,
    city: row.city,
    state: row.state,
    zip: row.zip,
    price: row.price,
    estimatedValue: row.zestimate,
    beds: row.beds,
    baths: row.baths,
    sqft: row.sqft,
    primaryListingImageUrl: row.imgSrc,
    photosCount: row.imgSrc ? 1 : 0,
    photosList: row.imgSrc ? [{ url: row.imgSrc }] : undefined,
    daysOnMarket: row.daysOnZillow,
    listingAgent: undefined,
    raw: row.raw,
  };
}

/**
 * Build a PropertyDetail from a single Zillow search row so the rest of the
 * scoring pipeline can stay endpoint-agnostic. `suggestedRent` comes from
 * Zillow's rentZestimate when available (the major win of HasData over the
 * RealEstateAPI PAYG path — no second per-listing call needed).
 */
function zillowToSyntheticDetail(row: ZillowListingSummary): PropertyDetail {
  return {
    id: row.zpid,
    address: row.address,
    estimatedValue: row.zestimate,
    estimatedMortgagePayment: undefined,
    suggestedRent: row.rentZestimate,
    hudFairMarketRent: undefined,
    beds: row.beds,
    baths: row.baths,
    sqft: row.sqft,
    yearBuilt: undefined,
    propertyType: row.homeType,
    lat: row.lat,
    lng: row.lng,
    photos: row.imgSrc ? [row.imgSrc] : undefined,
    raw: row.raw,
  };
}

/**
 * Legacy RealEstateAPI /PropertySearch path. Hydrates each candidate with
 * a per-listing PropertyDetail call. Kept as fallback when HASDATA_API_KEY
 * is not configured.
 */
async function searchRealEstateAPI(
  apiKey: string,
  constraints: ProjectConstraints,
  market: Market,
  size: number,
): Promise<ProviderSearchResult> {
  const rea = new RealEstateAPIClient({ apiKey });
  const baseFilters = buildPropertyFilters(constraints, market, size);
  const search = await searchWithFallback(rea, baseFilters);
  const hydrated = await hydrateInBatches(rea, search.data, MAX_HYDRATE_PARALLEL);
  const candidates = hydrated.map(({ listing, detail }) => ({
    listing,
    detail,
    source: "realestateapi" as const,
    sourceUrl: null,
  }));

  const firstRaw = search.data[0]?.raw;
  const firstSample = firstRaw && typeof firstRaw === "object"
    ? sanitizeSample(firstRaw as Record<string, unknown>)
    : null;

  return {
    candidates,
    query: baseFilters as unknown as Record<string, unknown>,
    firstSample,
  };
}

function buildPropertyFilters(
  constraints: ProjectConstraints,
  market: Market,
  size: number,
): PropertySearchFilters {
  const filters: PropertySearchFilters = { size };
  if (market.kind === "city") {
    filters.city = market.city;
    filters.state = market.state;
  } else if (market.kind === "zip") {
    filters.zip = market.zip;
  } else if (market.kind === "county") {
    filters.state = market.state;
  } else if (market.kind === "polygon") {
    filters.polygon = market.polygon;
  }
  if (constraints.priceMin !== undefined)
    filters.value_min = constraints.priceMin;
  if (constraints.priceMax !== undefined)
    filters.value_max = constraints.priceMax;
  if (constraints.bedsMin !== undefined) filters.beds_min = constraints.bedsMin;
  if (constraints.bathsMin !== undefined) filters.baths_min = constraints.bathsMin;
  if (constraints.sqftMin !== undefined)
    filters.building_size_min = constraints.sqftMin;
  if (
    constraints.propertyTypes.length &&
    !constraints.propertyTypes.includes("any")
  ) {
    filters.property_type = constraints.propertyTypes.map(mapPropertyType);
  }
  return filters;
}

/**
 * Try PropertySearch with `mls_active: true` first to prefer currently-listed
 * deals. If RealEstateAPI rejects that (PAYG plans don't have MLS data
 * access), retry without the MLS filter — the scout then ranges over
 * off-market property records too.
 */
async function searchWithFallback(
  rea: RealEstateAPIClient,
  baseFilters: PropertySearchFilters,
) {
  try {
    return await rea.propertySearch({ ...baseFilters, mls_active: true });
  } catch (err) {
    if (isWalletGatedError(err)) {
      return rea.propertySearch(baseFilters);
    }
    throw err;
  }
}

function isWalletGatedError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes("WALLET_ENDPOINT_NOT_AVAILABLE") ||
    msg.includes("mls_data") ||
    msg.includes("403")
  );
}

function mapPropertyType(t: string): string {
  switch (t) {
    case "single_family":
      return "SFR";
    case "condo":
      return "CONDO";
    case "townhouse":
      return "TOWNHOUSE";
    case "multi_family_2_4":
      return "MFR";
    case "multi_family_5_plus":
      return "APARTMENT";
    default:
      return t.toUpperCase();
  }
}

async function hydrateInBatches(
  rea: RealEstateAPIClient,
  listings: MLSListingSummary[],
  parallel: number,
): Promise<Array<{ listing: MLSListingSummary; detail: PropertyDetail | null }>> {
  const out: Array<{ listing: MLSListingSummary; detail: PropertyDetail | null }> =
    [];
  for (let i = 0; i < listings.length; i += parallel) {
    const batch = listings.slice(i, i + parallel);
    const results = await Promise.all(
      batch.map(async (listing) => {
        try {
          const detail = listing.id ? await rea.propertyDetail(listing.id) : null;
          return { listing, detail };
        } catch {
          return { listing, detail: null };
        }
      }),
    );
    out.push(...results);
  }
  return out;
}

function pickHudFmrRent(
  fmr: Record<string, number> | undefined,
  beds: number,
): number | undefined {
  if (!fmr) return undefined;
  const key = `fmr${Math.max(0, Math.min(4, Math.round(beds)))}`;
  const v = fmr[key];
  return typeof v === "number" ? v : undefined;
}

function estimateRentFromPrice(price: number): number {
  return price * 0.007;
}

function computeBaseScore(args: {
  dscr: number;
  monthlyCashflow: number;
  targetCashflow: number;
  cashOnCash: number;
}): number {
  let s = 50;
  if (args.dscr >= 1.25) s += 25;
  else if (args.dscr >= 1.1) s += 15;
  else if (args.dscr >= 1.0) s += 5;
  else s -= 25;

  if (args.targetCashflow > 0) {
    if (args.monthlyCashflow >= args.targetCashflow) s += 20;
    else if (args.monthlyCashflow >= args.targetCashflow * 0.75) s += 5;
    else s -= 10;
  }

  if (args.cashOnCash >= 0.1) s += 5;
  if (args.cashOnCash < 0) s -= 10;

  return Math.max(0, Math.min(100, s));
}

/**
 * Pick a small, high-signal subset of fields from a provider's raw record
 * so the diagnostics payload is helpful without bloating the response or
 * accidentally leaking PII (e.g. agent emails). When debugging a "0 deals"
 * scout, this is what tells you whether the upstream returned junk, the
 * wrong area, or no price data.
 */
function sanitizeSample(raw: Record<string, unknown>): Record<string, unknown> {
  const fields = [
    "zpid",
    "id",
    "address",
    "city",
    "state",
    "zip",
    "zipcode",
    "price",
    "unformattedPrice",
    "estimatedValue",
    "zestimate",
    "rentZestimate",
    "bedrooms",
    "beds",
    "bathrooms",
    "baths",
    "livingArea",
    "sqft",
    "homeType",
    "homeStatus",
    "daysOnZillow",
    "imgSrc",
    "detailUrl",
  ];
  const out: Record<string, unknown> = {};
  for (const k of fields) {
    if (k in raw) out[k] = raw[k];
  }
  out._allKeys = Object.keys(raw);
  return out;
}

function round(n: number, digits: number): number {
  if (!isFinite(n)) return 0;
  const f = Math.pow(10, digits);
  return Math.round(n * f) / f;
}
