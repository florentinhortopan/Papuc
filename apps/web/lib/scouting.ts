import {
  assumeHoaMonthly,
  computeAutoPMIRateFromLoan,
  computeBaseScore,
  computeBatchContext,
  computeProForma,
  DEFAULT_CLOSING_COSTS_PCT,
  defaultStrSchedule,
  estimateInsuranceMonthly,
  estimateScoutCredits,
  expandMarketsForScout,
  extractZillowAddress,
  HasDataClient,
  insuranceRateForState,
  propertyTaxRateForState,
  RealEstateAPIClient,
  resolveEffectiveDaysOnZillow,
  resolveScoutRule,
  streetFromZillowUrl,
  strScheduleFromEstimate,
  type ListingRecency,
  type Market,
  type MLSListingSummary,
  type ProjectConstraints,
  type PropertyDetail,
  type PropertySearchFilters,
  type ResolvedScoutRule,
  type ScoutCreditEstimate,
  type StrMarketAdrIntel,
  type SubscriptionTier,
  type ZillowListingSummary,
  type ZillowSearchFilters,
} from "@papuc/core";
import type { SupabaseClient } from "@supabase/supabase-js";

import { getOrResearchMarketStrIntel } from "./str-intel";

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
    alreadyKnown: number;
  };
  /** A redacted peek at the first raw provider record — useful when 0 results
   *  to verify the upstream is returning what we expect. */
  firstSample: Record<string, unknown> | null;
  /** Last upsert error string, if any. */
  lastUpsertError: string | null;
  /** Resolved keyword/filters sent to the provider, for easy reproduction. */
  query: Record<string, unknown>;
  /**
   * Property categories the user asked for that the selected provider
   * can't filter on (e.g. commercial / mixed-use on Zillow). The UI uses
   * these to display a "rerun on RealEstateAPI for these" hint.
   */
  unsupportedPropertyTypes?: string[];
  /** Tier × trigger policy from scout-rules.json. */
  scoutRule?: ResolvedScoutRule;
  /** Effective daysOnZillow after clamping project prefs to the rule ceiling. */
  effectiveDaysOnZillow?: ListingRecency;
  /** Planned HasData listing-page burn for this rule (detail calls excluded). */
  creditEstimate?: ScoutCreditEstimate;
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
    /** Owner's subscription tier; defaults to free when omitted. */
    subscriptionTier?: SubscriptionTier;
  } = {},
): Promise<ScoutResult> {
  const hasDataKey = process.env.HASDATA_API_KEY;
  const reaKey = process.env.REALESTATEAPI_KEY;
  if (!hasDataKey && !reaKey) {
    throw new Error("No real-estate provider configured: set HASDATA_API_KEY or REALESTATEAPI_KEY");
  }

  const triggerKind = options.triggerKind ?? "manual";
  const subscriptionTier: SubscriptionTier = options.subscriptionTier ?? "free";
  const scoutRule = resolveScoutRule(subscriptionTier, triggerKind);
  if (!scoutRule.enabled) {
    throw new Error(
      `Scout "${triggerKind}" is not enabled for tier "${subscriptionTier}" (see scout-rules.json)`,
    );
  }
  const creditEstimate = estimateScoutCredits(scoutRule);

  const { data: project, error: pErr } = await sb
    .from("projects")
    .select("*")
    .eq("id", projectId)
    .single();
  if (pErr || !project) throw new Error("project not found");

  const constraints = project.constraints as ProjectConstraints;
  const effectiveDaysOnZillow = resolveEffectiveDaysOnZillow(
    constraints.daysOnMarketMax,
    scoutRule.daysOnZillow,
  );

  const { data: runRow, error: runErr } = await sb
    .from("scout_runs")
    .insert({
      project_id: project.id,
      triggered_by: options.triggeredBy ?? null,
      trigger_kind: triggerKind,
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
    alreadyKnown: 0,
  };
  let lastUpsertError: string | null = null;
  let providerQuery: Record<string, unknown> = {};
  let firstSample: Record<string, unknown> | null = null;
  const provider = resolveScoutProvider(
    constraints,
    Boolean(hasDataKey),
    Boolean(reaKey),
  );

  try {
    const markets = expandMarketsForScout(constraints.markets);
    if (!markets.length) throw new Error("project has no market");

    // Caps come from scout-rules.json (tier × trigger). Override size only
    // when the caller passes an explicit value (tests / ops).
    const size = options.size ?? scoutRule.targetCount;
    const perMarketSize = Math.max(
      8,
      Math.ceil(size / Math.max(1, markets.length)),
    );

    const merged: ScoutCandidate[] = [];
    const seenIds = new Set<string>();
    const marketQueries: unknown[] = [];

    for (const market of markets) {
      if (merged.length >= size) break;
      const search: ProviderSearchResult =
        provider === "hasdata"
          ? await searchHasData(hasDataKey!, constraints, market, perMarketSize, {
              maxPages: scoutRule.maxPages,
              daysOnZillow: effectiveDaysOnZillow,
            })
          : await searchRealEstateAPI(reaKey!, constraints, market, perMarketSize);
      marketQueries.push(search.query);
      if (!firstSample && search.firstSample) firstSample = search.firstSample;
      for (const c of search.candidates) {
        const id = String(c.listing.id ?? "").trim();
        if (id) {
          if (seenIds.has(id)) continue;
          seenIds.add(id);
        }
        merged.push(c);
        if (merged.length >= size) break;
      }
    }

    let candidates = merged.slice(0, size);
    providerQuery = {
      markets: markets.map((m) =>
        m.kind === "city"
          ? `${m.city}, ${m.state}`
          : m.kind === "zip"
            ? m.zip
            : m.kind === "county"
              ? `${m.county}, ${m.state}`
              : m.kind === "state"
                ? m.state
                : m.kind === "near"
                  ? `near ${m.place}`
                  : "polygon",
      ),
      perMarketSize,
      queries: marketQueries,
    };
    candidatesSeen = candidates.length;

    // Primary market for STR intel / logging (first expanded).
    const market = markets[0]!;

    if (scoutRule.skipKnownProperties && candidates.length > 0) {
      const { data: existing } = await sb
        .from("deals")
        .select("source_property_id")
        .eq("project_id", project.id)
        .eq("source", provider);
      const known = new Set(
        (existing ?? [])
          .map((r: { source_property_id?: string | null }) =>
            String(r.source_property_id ?? "").trim(),
          )
          .filter(Boolean),
      );
      if (known.size > 0) {
        const fresh: typeof candidates = [];
        for (const c of candidates) {
          const id = String(c.listing.id ?? "").trim();
          if (id && known.has(id)) {
            dropped.alreadyKnown += 1;
            continue;
          }
          fresh.push(c);
        }
        candidates = fresh;
      }
    }

    console.log(
      "[scout] provider=%s markets=%d candidates=%d query=%j",
      provider,
      markets.length,
      candidates.length,
      providerQuery,
    );

    const downPayment = constraints.downPayment ?? 0;
    const targetCashflow = constraints.targetMonthlyCashflow ?? 0;

    // STR projects: sanity-check the rent-based ADR heuristic against
    // cached web-search market intel (plausible ADR range + occupancy),
    // and reuse any comps-based AirROI estimates users already paid for
    // on individual deals. Both are best-effort — a cold cache or a
    // research failure degrades to the plain heuristic, never blocks.
    let marketAdrIntel: StrMarketAdrIntel | undefined;
    const strEstimates = new Map<
      string,
      { adr: number; occupancy: number; monthlyRevenueDistribution?: number[] }
    >();
    if (constraints.strategy === "STR") {
      const intelMarket = resolveIntelMarket(market, candidates);
      if (intelMarket) {
        const intel = await getOrResearchMarketStrIntel(sb, intelMarket);
        if (intel) {
          marketAdrIntel = {
            adrLow: intel.adr_low ?? undefined,
            adrMedian: intel.adr_median ?? undefined,
            adrHigh: intel.adr_high ?? undefined,
            occupancyAvg: intel.occupancy_avg ?? undefined,
          };
          console.log(
            "[scout/str-intel] market=%s adr=[%s..%s] occ=%s",
            intel.market_key,
            intel.adr_low ?? "?",
            intel.adr_high ?? "?",
            intel.occupancy_avg ?? "?",
          );
        }
      }

      const { data: estimated } = await sb
        .from("deals")
        .select("source_property_id, str_adr, str_occupancy, str_monthly_distribution")
        .eq("project_id", project.id)
        .not("str_estimated_at", "is", null);
      for (const row of estimated ?? []) {
        if (typeof row.str_adr === "number" && typeof row.str_occupancy === "number") {
          strEstimates.set(row.source_property_id as string, {
            adr: Number(row.str_adr),
            occupancy: Number(row.str_occupancy),
            monthlyRevenueDistribution: Array.isArray(row.str_monthly_distribution)
              ? (row.str_monthly_distribution as number[])
              : undefined,
          });
        }
      }
    }

    // Size percentiles over the whole candidate pool (pre-filter) so the
    // asset bucket compares each property against what the market actually
    // offered this run, not just the financially-surviving subset.
    const batchContext = computeBatchContext(
      candidates.map(({ listing }) => ({
        sqft: listing.sqft,
        lotSizeSqft: listing.lotSizeSqft,
        price: listing.price,
      })),
    );

    const landOnlyProject = isLandOnlyProject(constraints);

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

      const homeType =
        typeof (listing.raw as Record<string, unknown> | undefined)?.homeType ===
        "string"
          ? ((listing.raw as Record<string, unknown>).homeType as string)
          : null;
      // Vacant land: no rent, no rent estimates. Underwriting a fabricated
      // 0.7%-of-price rent made every mid-priced parcel "cashflow negative"
      // and silently die at the gates below, so land carries $0 income and
      // its cashflow is simply the (negative) monthly carrying cost.
      const isLand = homeType === "LOT" || (homeType === null && landOnlyProject);
      const monthlyRent = isLand
        ? 0
        : (detail?.suggestedRent ??
          pickHudFmrRent(detail?.hudFairMarketRent, listing.beds ?? 3) ??
          estimateRentFromPrice(effectivePrice));

      // HOA: prefer listing-level value (free, came back on the search call)
      // and fall back to detail (paid call, only when we already had to make
      // one). `undefined` from both means the API simply did not return one —
      // for condos/townhouses that almost always means an unreported fee,
      // not a free ride, so underwrite with a typical fee instead of $0.
      const hoaMonthly = listing.hoaMonthly ?? detail?.hoaMonthly;
      const underwritingHoa = hoaMonthly ?? assumeHoaMonthly(homeType);

      // Location-aware carrying costs: effective property tax rate and
      // insurance rate for the listing's state instead of flat national
      // averages (1.1% tax everywhere made NJ/TX deals look cheap and HI
      // deals look expensive). The rate is persisted on the deal so the
      // detail page underwrites at exactly the same number.
      const stateCode = listing.state ?? ("state" in market ? market.state : undefined);
      const propertyTaxRatePct = propertyTaxRateForState(stateCode);
      const insuranceRatePct = insuranceRateForState(stateCode);

      // For STR we hydrate the full 12-month schedule from the shared
      // helper in @papuc/core so the cashflow we store in deal_scores
      // (and surface on the deal card) matches exactly what the detail
      // page recomputes when the user opens the listing. Priority:
      //   1. comps-based AirROI estimate the user already fetched for
      //      this exact property (real ADR + seasonality),
      //   2. rent heuristic clamped into the market's plausible ADR
      //      range with market-average occupancy (web-search intel),
      //   3. plain rent heuristic.
      const storedEstimate = strEstimates.get(listing.id);
      const strSchedule =
        constraints.strategy === "STR" && !isLand
          ? storedEstimate
            ? strScheduleFromEstimate(storedEstimate)
            : defaultStrSchedule(monthlyRent, marketAdrIntel)
          : null;
      // Provenance + value of the ADR assumption, persisted with the
      // score so the deal card and detail page can display the exact
      // nightly rate this cashflow was underwritten at.
      const assumedAdr = strSchedule ? round(strSchedule.monthlyADR[0]!, 0) : null;
      const adrSource = !strSchedule
        ? null
        : storedEstimate
          ? ("airroi" as const)
          : marketAdrIntel &&
              (marketAdrIntel.adrLow !== undefined ||
                marketAdrIntel.adrHigh !== undefined ||
                marketAdrIntel.adrMedian !== undefined)
            ? ("market_checked" as const)
            : ("heuristic" as const);

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
        // Land always underwrites as a $0-rent LTR: passing "STR" without a
        // schedule would fall back to the proforma's $200/night default and
        // invent revenue for a vacant parcel.
        strategy: isLand ? "LTR" : constraints.strategy,
        monthlyRentLTR: constraints.strategy === "LTR" ? monthlyRent : 0,
        monthlyNights: strSchedule?.monthlyNights,
        monthlyADR: strSchedule?.monthlyADR,
        monthlyOccupancy: strSchedule?.monthlyOccupancy,
        monthlyAvgStays: strSchedule?.monthlyAvgStays,
        hoaMonthly: underwritingHoa,
        propertyTaxRatePct,
        insuranceMonthly: estimateInsuranceMonthly(effectivePrice, insuranceRatePct),
        pmiRatePct: computeAutoPMIRateFromLoan(effectivePrice, effectiveDown),
        closingCosts: effectivePrice * DEFAULT_CLOSING_COSTS_PCT,
        // Maintenance (1%/yr of value), LTR vacancy (5%), and management
        // fees (15% STR / 8% LTR) come from the shared core defaults so
        // the detail page recomputes the identical cashflow.
      });

      const monthlyCashflow = proforma.annualPreTaxProfit / 12;
      // Land skips both rent-based gates: with $0 income its DSCR is 0 and
      // its cashflow is the carrying cost, so the gates would drop every
      // parcel. Value ranking happens in the land finance score instead.
      if (!isLand) {
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
      }

      const { score: baseScore, components: scoreComponents } =
        computeBaseScore({
          dscr: proforma.dscr,
          monthlyCashflow,
          targetCashflow,
          cashOnCash: proforma.cashOnCashReturn,
          assetClass: isLand ? "land" : "rental",
          signals: {
            price: effectivePrice,
            priceChange: listing.priceChange,
            priceChangedAt: listing.priceChangedAt,
            daysOnMarket: listing.daysOnMarket,
            sqft: listing.sqft ?? detail?.sqft,
            lotSizeSqft: listing.lotSizeSqft,
            hoaMonthly,
            photoCount: listing.photosCount,
            hasVirtualTour: listing.hasVirtualTour,
          },
          batch: batchContext,
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
            property_tax_rate: propertyTaxRatePct,
            days_on_market: listing.daysOnMarket ?? null,
            price_change: listing.priceChange ?? null,
            price_changed_at: listing.priceChangedAt ?? null,
            lot_size: listing.lotSizeSqft ?? null,
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
          score_components:
            assumedAdr !== null
              ? { ...scoreComponents, adr: assumedAdr, adrSource }
              : scoreComponents,
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

    const unsupportedPropertyTypes =
      provider === "hasdata"
        ? constraints.propertyTypes.filter((t) =>
            ZILLOW_UNSUPPORTED_TYPES.has(t),
          )
        : [];

    return {
      scoutRunId: runRow.id,
      candidatesSeen,
      dealsAdded,
      dealsScored,
      elapsedMs: Date.now() - startedAt,
      diagnostics: {
        scoutRule,
        effectiveDaysOnZillow,
        creditEstimate,
        provider,
        dropped,
        firstSample,
        lastUpsertError,
        query: providerQuery,
        unsupportedPropertyTypes: unsupportedPropertyTypes.length
          ? unsupportedPropertyTypes
          : undefined,
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
  policy: { maxPages: number; daysOnZillow: ListingRecency },
): Promise<ProviderSearchResult> {
  const client = new HasDataClient({ apiKey });
  const filters = buildHasDataFilters(constraints, market, policy.daysOnZillow);
  // Page budget comes from scout-rules.json (tier × trigger), not a hard
  // coded 5. Manual Pro can go deeper; nightly stays at 1 page of fresh.
  const maxPages = Math.max(0, Math.min(policy.maxPages, Math.ceil(size / 40) || 1));
  console.log("[scout/hasdata] filters=%j maxPages=%d", filters, maxPages);
  const result = await client.searchZillowAll(filters, {
    maxPages,
    targetCount: size,
  });
  console.log(
    "[scout/hasdata] total=%d resultCount=%d pagesFetched=%s totalPages=%s",
    result.total,
    result.resultCount,
    result.pagesFetched ?? "?",
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
    query: {
      ...(filters as unknown as Record<string, unknown>),
      pagesFetched: result.pagesFetched,
      totalPages: result.totalPages,
      maxPages,
    },
    firstSample,
  };
}

function buildHasDataFilters(
  constraints: ProjectConstraints,
  market: Market,
  daysOnZillow: ListingRecency,
): ZillowSearchFilters {
  const filters: ZillowSearchFilters = {
    keyword: marketToZillowKeyword(market),
    type: "forSale",
    // Always set — scout-rules ceiling (possibly tightened by project prefs).
    daysOnZillow,
  };
  if (constraints.priceMin !== undefined) filters.priceMin = constraints.priceMin;
  if (constraints.priceMax !== undefined) filters.priceMax = constraints.priceMax;
  // Vacant lots carry no beds/baths/interior sqft on Zillow, so any of
  // those filters on a land-only search wipes out the entire inventory
  // (live probe: beds[min]=1 cut 28,477 CA lots to 21; squareFeet[min]
  // cut them to 1). Lot size is the only structural filter that applies.
  if (!isLandOnlyProject(constraints)) {
    if (constraints.bedsMin !== undefined) filters.bedsMin = constraints.bedsMin;
    if (constraints.bedsMax !== undefined) filters.bedsMax = constraints.bedsMax;
    if (constraints.bathsMin !== undefined) filters.bathsMin = constraints.bathsMin;
    if (constraints.bathsMax !== undefined) filters.bathsMax = constraints.bathsMax;
    if (constraints.sqftMin !== undefined) filters.sqftMin = constraints.sqftMin;
    if (constraints.sqftMax !== undefined) filters.sqftMax = constraints.sqftMax;
  }
  if (constraints.lotSizeMinSqft !== undefined)
    filters.lotSizeMin = constraints.lotSizeMinSqft;
  if (constraints.yearBuiltMin !== undefined)
    filters.yearBuiltMin = constraints.yearBuiltMin;
  if (constraints.hoaMax !== undefined) filters.hoaMax = constraints.hoaMax;

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
 * True when every requested property type is land. Land-only searches get
 * dwelling filters (beds/baths/interior sqft) suppressed and skip the
 * rent-based DSCR/cashflow gates — vacant dirt has neither rooms nor rent.
 */
function isLandOnlyProject(constraints: ProjectConstraints): boolean {
  return (
    constraints.propertyTypes.length > 0 &&
    constraints.propertyTypes.every((t) => t === "land")
  );
}

/**
 * Property categories that Zillow / HasData doesn't list. Surfaced to
 * the scout diagnostics so the UI can warn the user to route via
 * RealEstateAPI for these.
 */
export const ZILLOW_UNSUPPORTED_TYPES = new Set([
  "mixed_use",
  "commercial",
]);

/**
 * Prefer RealEstateAPI when the project asks for mixed_use / commercial
 * (HasData/Zillow can't list them). Otherwise HasData-first when keyed.
 */
export function resolveScoutProvider(
  constraints: ProjectConstraints,
  hasHasData: boolean,
  hasRea: boolean,
): CandidateSource {
  const wantsUnsupported = constraints.propertyTypes.some((t) =>
    ZILLOW_UNSUPPORTED_TYPES.has(t),
  );
  if (wantsUnsupported && hasRea) return "realestateapi";
  if (hasHasData) return "hasdata";
  if (hasRea) return "realestateapi";
  throw new Error(
    "No real-estate provider configured: set HASDATA_API_KEY or REALESTATEAPI_KEY",
  );
}

/**
 * Zillow's Listing API takes a free-form area string as `keyword`. For
 * city markets we use "City, ST"; for zip we pass the zip code directly;
 * for county we fall back to "<County> County, ST"; for state-wide
 * searches the bare 2-letter code works ("CA" → 28k+ results, verified by
 * live probe — while "California, CA" resolves to nothing, which is how
 * state-wide scouts used to silently return zero). Polygon markets aren't
 * supported by the listing endpoint — surface a clear error rather than
 * silently returning the wrong region. `near` should be expanded before
 * calling this; if one slips through, fall back to place + state.
 */
function marketToZillowKeyword(market: Market): string {
  if (market.kind === "city") return `${market.city}, ${market.state}`;
  if (market.kind === "zip") return market.zip;
  if (market.kind === "county") return `${market.county} County, ${market.state}`;
  if (market.kind === "state") return market.state;
  if (market.kind === "near") {
    return market.state ? `${market.place}, ${market.state}` : market.place;
  }
  throw new Error(
    "HasData/Zillow scout does not support polygon markets — pick a city, zip, county, or state.",
  );
}

/**
 * Map our internal PropertyType enum to HasData/Zillow's homeTypes enum.
 * HasData accepts only this set (validated server-side, 422 otherwise):
 *   house | townhome | multiFamily | condo | lot | apartment | manufactured
 *
 * Returns null for categories Zillow doesn't model (mixed-use, commercial)
 * — the scout pipeline routes those to RealEstateAPI when available and
 * surfaces a warning otherwise.
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
    case "manufactured":
      return "manufactured";
    case "land":
      return "lot";
    case "mixed_use":
    case "commercial":
    case "any":
    default:
      return null;
  }
}

function zillowToMLSListing(row: ZillowListingSummary): MLSListingSummary {
  // Prefer the normalized street; if a HasData rename ever slips past
  // normalizeZillowListing again, recover from the raw payload / URL so
  // we never upsert null addresses ("Address pending" on every card).
  const address =
    row.address ??
    (row.raw ? extractZillowAddress(row.raw) : undefined) ??
    streetFromZillowUrl(row.detailUrl);
  return {
    id: row.zpid,
    address,
    city: row.city,
    state: row.state,
    zip: row.zip,
    price: row.price,
    estimatedValue: row.zestimate,
    beds: row.beds,
    baths: row.baths,
    sqft: row.sqft,
    primaryListingImageUrl: row.imgSrc,
    photosCount: row.photoCount ?? (row.imgSrc ? 1 : 0),
    photosList: row.imgSrc ? [{ url: row.imgSrc }] : undefined,
    daysOnMarket: row.daysOnZillow,
    listingAgent: undefined,
    hoaMonthly: row.hoaMonthly,
    priceChange: row.priceChange,
    priceChangedAt: row.priceChangedAt,
    lotSizeSqft: row.lotSizeSqft,
    hasVirtualTour: row.hasVirtualTour,
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
  const address =
    row.address ??
    (row.raw ? extractZillowAddress(row.raw) : undefined) ??
    streetFromZillowUrl(row.detailUrl);
  return {
    id: row.zpid,
    address,
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
  } else if (market.kind === "county" || market.kind === "state") {
    filters.state = market.state;
  } else if (market.kind === "near") {
    // Prefer expandMarketsForScout before REA; if a near slips through,
    // treat place as a city keyword with optional state.
    filters.city = market.place;
    if (market.state) filters.state = market.state;
  } else if (market.kind === "polygon") {
    filters.polygon = market.polygon;
  }
  if (constraints.priceMin !== undefined)
    filters.value_min = constraints.priceMin;
  if (constraints.priceMax !== undefined)
    filters.value_max = constraints.priceMax;
  // Same land rule as the HasData path: dwelling filters don't apply to
  // vacant lots and would zero out the search.
  if (!isLandOnlyProject(constraints)) {
    if (constraints.bedsMin !== undefined) filters.beds_min = constraints.bedsMin;
    if (constraints.bathsMin !== undefined)
      filters.baths_min = constraints.bathsMin;
    if (constraints.sqftMin !== undefined)
      filters.building_size_min = constraints.sqftMin;
  }
  if (constraints.yearBuiltMin !== undefined)
    filters.year_built_min = constraints.yearBuiltMin;
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

/**
 * Map our internal PropertyType enum to RealEstateAPI property_type codes.
 * RealEstateAPI accepts a string list; the values below match the codes
 * used in the PropertySearch documentation. Unknown values are passed
 * through uppercased so power users can hint custom codes via notes if
 * needed without us silently dropping them.
 */
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
    case "manufactured":
      return "MOBILE";
    case "land":
      return "LAND";
    case "mixed_use":
      return "MIXED_USE";
    case "commercial":
      return "COMMERCIAL";
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

/**
 * Resolve the city/state to research STR intel for. City markets carry
 * it directly; zip/county/polygon markets borrow it from the first
 * candidate listing that has both (all listings in a zip share a city
 * for our purposes — regulations and ADR are city/county-level anyway).
 */
function resolveIntelMarket(
  market: Market,
  candidates: ScoutCandidate[],
): { city: string; state: string } | null {
  if (market.kind === "city" && market.city && market.state) {
    return { city: market.city, state: market.state };
  }
  for (const { listing } of candidates) {
    if (listing.city && listing.state) {
      return { city: listing.city, state: listing.state };
    }
  }
  return null;
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
    "lotAreaValue",
    "lotAreaUnits",
    "lotSize",
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

function haversineMiles(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 3958.8;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export interface CompScoutOptions {
  /** Live scenario / editor price — preferred for the HasData price band. */
  price?: number;
  beds?: number;
  baths?: number;
  sqft?: number;
  /** Max comps to return / upsert (default 12). */
  maxComps?: number;
}

export interface ScoutedComparable {
  dealId: string;
  sourcePropertyId: string;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  price?: number | null;
  beds?: number | null;
  baths?: number | null;
  sqft?: number | null;
  primaryListingImageUrl?: string | null;
  daysOnMarket?: number | null;
  /** Already in this project before this scout run (upsert refreshed it). */
  alreadyInProject: boolean;
  distanceMiles?: number;
  papucScore?: number | null;
}

export interface ScoutComparablesResult {
  subjectDealId: string;
  projectId: string;
  comparables: ScoutedComparable[];
  query: Record<string, unknown>;
  added: number;
  refreshed: number;
  note?: string;
}

/** Map Zillow `homeType` enums onto HasData's `homeTypes[]` filter values. */
function zillowHomeTypeToFilter(homeType: string | undefined): string | null {
  if (!homeType) return null;
  const t = homeType.trim();
  const allowed = new Set([
    "house",
    "townhome",
    "multiFamily",
    "condo",
    "lot",
    "apartment",
    "manufactured",
  ]);
  if (allowed.has(t)) return t;
  switch (t.toUpperCase()) {
    case "SINGLE_FAMILY":
      return "house";
    case "CONDO":
      return "condo";
    case "TOWNHOUSE":
      return "townhome";
    case "MULTI_FAMILY":
      return "multiFamily";
    case "APARTMENT":
      return "apartment";
    case "MANUFACTURED":
      return "manufactured";
    case "LOT":
      return "lot";
    default:
      return null;
  }
}

/**
 * Find nearby similar listings via HasData Zillow search (biased by the live
 * scenario price / beds / baths / sqft), upsert them into the subject deal's
 * project without duplicates (`project_id,source,source_property_id`), and
 * return the scouted set for the Comparables panel.
 *
 * Unlike full project scout, comps skip DSCR/cashflow gates — every nearby
 * match is added so the user can compare, not only underwriting winners.
 */
export async function scoutComparablesForDeal(
  sb: SupabaseClient,
  dealId: string,
  options: CompScoutOptions = {},
): Promise<ScoutComparablesResult> {
  const hasdataKey = process.env.HASDATA_API_KEY?.trim();
  if (!hasdataKey) {
    throw new Error("HASDATA_API_KEY is not configured");
  }

  const { data: subject, error: subErr } = await sb
    .from("deals")
    .select(
      "id, project_id, source, source_property_id, address, city, state, zip, price, beds, baths, sqft, lat, lng, mls_data",
    )
    .eq("id", dealId)
    .single();
  if (subErr || !subject) throw new Error("deal not found");

  const projectId = subject.project_id as string;
  const subjectZpid = String(subject.source_property_id ?? "").trim();

  const { data: project, error: pErr } = await sb
    .from("projects")
    .select("*")
    .eq("id", projectId)
    .single();
  if (pErr || !project) throw new Error("project not found");

  const constraints = project.constraints as ProjectConstraints;
  const price =
    (typeof options.price === "number" && options.price > 0
      ? options.price
      : null) ??
    (typeof subject.price === "number" && Number(subject.price) > 0
      ? Number(subject.price)
      : null);
  const beds =
    (typeof options.beds === "number" ? options.beds : null) ??
    (subject.beds != null ? Number(subject.beds) : null);
  const baths =
    (typeof options.baths === "number" ? options.baths : null) ??
    (subject.baths != null ? Number(subject.baths) : null);
  const sqft =
    (typeof options.sqft === "number" && options.sqft > 0
      ? options.sqft
      : null) ??
    (subject.sqft != null && Number(subject.sqft) > 0
      ? Number(subject.sqft)
      : null);

  if (!price) {
    return {
      subjectDealId: dealId,
      projectId,
      comparables: [],
      query: {},
      added: 0,
      refreshed: 0,
      note: "Set a purchase price (scenario or listing) to scout comps.",
    };
  }

  const keyword = [subject.zip, subject.city, subject.state]
    .filter(Boolean)
    .join(", ")
    .trim();
  if (!keyword) {
    return {
      subjectDealId: dealId,
      projectId,
      comparables: [],
      query: {},
      added: 0,
      refreshed: 0,
      note: "Deal is missing city/state/zip — cannot search nearby comps.",
    };
  }

  const priceMin = Math.max(1, Math.round(price * 0.8));
  const priceMax = Math.round(price * 1.2);
  const maxComps = Math.min(Math.max(options.maxComps ?? 12, 1), 24);

  const mls = (subject.mls_data ?? {}) as Record<string, unknown>;
  const rawHomeType =
    typeof mls.homeType === "string"
      ? mls.homeType
      : typeof (mls as { home_type?: unknown }).home_type === "string"
        ? ((mls as { home_type: string }).home_type)
        : undefined;
  const homeTypeFilter = zillowHomeTypeToFilter(rawHomeType);

  const filters: ZillowSearchFilters = {
    keyword,
    type: "forSale",
    priceMin,
    priceMax,
  };
  if (typeof beds === "number" && beds >= 0) {
    filters.bedsMin = Math.max(0, Math.floor(beds) - 1);
    filters.bedsMax = Math.floor(beds) + 1;
  }
  if (typeof baths === "number" && baths >= 0) {
    filters.bathsMin = Math.max(0, Math.floor(baths) - 1);
    filters.bathsMax = Math.floor(baths) + 1;
  }
  if (typeof sqft === "number" && sqft > 0) {
    filters.sqftMin = Math.max(1, Math.round(sqft * 0.75));
    filters.sqftMax = Math.round(sqft * 1.25);
  }
  if (homeTypeFilter) filters.homeTypes = [homeTypeFilter];

  const client = new HasDataClient({ apiKey: hasdataKey });
  const search = await client.searchZillowAll(filters, {
    targetCount: Math.max(maxComps * 3, 30),
    maxPages: 3,
  });

  const subjectLat = typeof subject.lat === "number" ? subject.lat : null;
  const subjectLng = typeof subject.lng === "number" ? subject.lng : null;

  type Ranked = ZillowListingSummary & { distanceMiles?: number };
  const ranked: Ranked[] = [];
  for (const listing of search.data) {
    if (!listing.zpid || listing.zpid === subjectZpid) continue;
    if (!(listing.price && listing.price > 0)) continue;
    const row: Ranked = { ...listing };
    if (
      subjectLat != null &&
      subjectLng != null &&
      typeof listing.lat === "number" &&
      typeof listing.lng === "number"
    ) {
      row.distanceMiles = haversineMiles(
        { lat: subjectLat, lng: subjectLng },
        { lat: listing.lat, lng: listing.lng },
      );
    }
    ranked.push(row);
  }
  ranked.sort((a, b) => {
    const da = a.distanceMiles ?? Number.POSITIVE_INFINITY;
    const db = b.distanceMiles ?? Number.POSITIVE_INFINITY;
    if (da !== db) return da - db;
    return (b.price ?? 0) - (a.price ?? 0);
  });
  const shortlist = ranked.slice(0, maxComps);

  const { data: existingRows } = await sb
    .from("deals")
    .select("id, source_property_id")
    .eq("project_id", projectId)
    .eq("source", "hasdata");
  const existingByZpid = new Map<string, string>();
  for (const row of existingRows ?? []) {
    if (row.source_property_id) {
      existingByZpid.set(String(row.source_property_id), row.id as string);
    }
  }

  const batchContext = computeBatchContext(
    shortlist.map((listing) => ({
      sqft: listing.sqft,
      lotSizeSqft: listing.lotSizeSqft,
      price: listing.price,
    })),
  );

  const downPayment = constraints.downPayment ?? 0;
  const targetCashflow = constraints.targetMonthlyCashflow ?? 0;
  const landOnlyProject = isLandOnlyProject(constraints);

  let added = 0;
  let refreshed = 0;
  const comparables: ScoutedComparable[] = [];

  for (const zillow of shortlist) {
    const already = existingByZpid.has(zillow.zpid);
    try {
      const listing = zillowToMLSListing(zillow);
      const detail = zillowToSyntheticDetail(zillow);
      const mlsPrice = listing.price;
      const avm = listing.estimatedValue ?? detail.estimatedValue;
      const effectivePrice = mlsPrice ?? avm;
      if (!effectivePrice) continue;

      const effectiveDown =
        downPayment > 0
          ? downPayment
          : effectivePrice * (1 - constraints.mortgage.ltv);

      const homeType =
        typeof (listing.raw as Record<string, unknown> | undefined)?.homeType ===
        "string"
          ? ((listing.raw as Record<string, unknown>).homeType as string)
          : zillow.homeType ?? null;
      const isLand = homeType === "LOT" || (homeType === null && landOnlyProject);
      const monthlyRent = isLand
        ? 0
        : (detail.suggestedRent ??
          pickHudFmrRent(detail.hudFairMarketRent, listing.beds ?? 3) ??
          estimateRentFromPrice(effectivePrice));

      const hoaMonthly = listing.hoaMonthly ?? detail.hoaMonthly;
      const underwritingHoa = hoaMonthly ?? assumeHoaMonthly(homeType);
      const stateCode = listing.state ?? subject.state ?? undefined;
      const propertyTaxRatePct = propertyTaxRateForState(stateCode);
      const insuranceRatePct = insuranceRateForState(stateCode);

      const proforma = computeProForma({
        price: effectivePrice,
        downPayment: effectiveDown,
        rateAPR: constraints.mortgage.rateAPR,
        termYears: constraints.mortgage.termYears,
        interestOnly: constraints.mortgage.interestOnly ?? false,
        strategy: isLand ? "LTR" : constraints.strategy === "STR" ? "LTR" : constraints.strategy,
        // Comps underwrite as LTR so we don't invent STR seasonality without
        // an AirROI estimate; users can open the deal and run STR later.
        monthlyRentLTR: monthlyRent,
        hoaMonthly: underwritingHoa,
        propertyTaxRatePct,
        insuranceMonthly: estimateInsuranceMonthly(effectivePrice, insuranceRatePct),
        pmiRatePct: computeAutoPMIRateFromLoan(effectivePrice, effectiveDown),
        closingCosts: effectivePrice * DEFAULT_CLOSING_COSTS_PCT,
      });

      const monthlyCashflow = proforma.annualPreTaxProfit / 12;
      const { score: baseScore, components: scoreComponents } = computeBaseScore({
        dscr: proforma.dscr,
        monthlyCashflow,
        targetCashflow,
        cashOnCash: proforma.cashOnCashReturn,
        assetClass: isLand ? "land" : "rental",
        signals: {
          price: effectivePrice,
          priceChange: listing.priceChange,
          priceChangedAt: listing.priceChangedAt,
          daysOnMarket: listing.daysOnMarket,
          sqft: listing.sqft ?? detail.sqft,
          lotSizeSqft: listing.lotSizeSqft,
          hoaMonthly,
          photoCount: listing.photosCount,
          hasVirtualTour: listing.hasVirtualTour,
        },
        batch: batchContext,
      });

      const photos =
        listing.photosList?.map((p) => p.url) ?? (detail.photos ?? []);

      const { data: dealRow, error: dealErr } = await sb
        .from("deals")
        .upsert(
          {
            project_id: projectId,
            source: "hasdata",
            source_property_id: listing.id,
            address: listing.address ?? null,
            city: listing.city ?? null,
            state: listing.state ?? null,
            zip: listing.zip ?? null,
            lat: detail.lat ?? null,
            lng: detail.lng ?? null,
            price: mlsPrice ?? null,
            beds: listing.beds ?? detail.beds ?? null,
            baths: listing.baths ?? detail.baths ?? null,
            sqft: listing.sqft ?? detail.sqft ?? null,
            photos,
            primary_image_url: listing.primaryListingImageUrl ?? null,
            source_url: zillow.detailUrl ?? null,
            mls_data: listing.raw ?? null,
            est_value: avm ?? null,
            est_rent: monthlyRent,
            hoa_monthly: hoaMonthly ?? null,
            property_tax_rate: propertyTaxRatePct,
            days_on_market: listing.daysOnMarket ?? null,
            price_change: listing.priceChange ?? null,
            price_changed_at: listing.priceChangedAt ?? null,
            lot_size: listing.lotSizeSqft ?? null,
            hud_fmr: detail.hudFairMarketRent ?? null,
            last_refreshed_at: new Date().toISOString(),
          },
          { onConflict: "project_id,source,source_property_id" },
        )
        .select("id")
        .single();
      if (dealErr || !dealRow) {
        console.warn("[comps] upsert failed", listing.id, dealErr?.message);
        continue;
      }

      await sb.from("deal_scores").upsert(
        {
          deal_id: dealRow.id,
          project_id: projectId,
          dscr: round(proforma.dscr, 3),
          dscr_lender_haircut: round(proforma.dscrLenderHaircut, 3),
          cash_on_cash: round(proforma.cashOnCashReturn, 4),
          monthly_cashflow: round(monthlyCashflow, 2),
          irr_5yr: proforma.irr5Yr !== null ? round(proforma.irr5Yr, 4) : null,
          payout_years: round(proforma.payoutYears, 2),
          score: Math.round(baseScore),
          score_components: scoreComponents,
          rationale: null,
          computed_proforma: proforma,
          computed_at: new Date().toISOString(),
        },
        { onConflict: "deal_id" },
      );

      if (already) refreshed += 1;
      else {
        added += 1;
        existingByZpid.set(zillow.zpid, dealRow.id as string);
      }

      comparables.push({
        dealId: dealRow.id as string,
        sourcePropertyId: zillow.zpid,
        address: listing.address ?? null,
        city: listing.city ?? null,
        state: listing.state ?? null,
        zip: listing.zip ?? null,
        price: mlsPrice ?? null,
        beds: listing.beds ?? null,
        baths: listing.baths ?? null,
        sqft: listing.sqft ?? null,
        primaryListingImageUrl: listing.primaryListingImageUrl ?? null,
        daysOnMarket: listing.daysOnMarket ?? null,
        alreadyInProject: already,
        distanceMiles:
          typeof zillow.distanceMiles === "number"
            ? round(zillow.distanceMiles, 2)
            : undefined,
        papucScore: Math.round(baseScore),
      });
    } catch (err) {
      console.warn(
        "[comps] failed for",
        zillow.zpid,
        err instanceof Error ? err.message : err,
      );
    }
  }

  return {
    subjectDealId: dealId,
    projectId,
    comparables,
    query: {
      ...(filters as unknown as Record<string, unknown>),
      scenarioPrice: price,
      pagesFetched: search.pagesFetched,
    },
    added,
    refreshed,
    note:
      comparables.length === 0
        ? "No nearby for-sale comps matched this scenario. Try adjusting price or beds/baths."
        : undefined,
  };
}
