import {
  computeProForma,
  RealEstateAPIClient,
  type Market,
  type MLSListingSummary,
  type ProjectConstraints,
  type PropertyDetail,
} from "@papuc/core";
import type { SupabaseClient } from "@supabase/supabase-js";

const MAX_HYDRATE_PARALLEL = 5;

export interface ScoutResult {
  scoutRunId: string;
  candidatesSeen: number;
  dealsAdded: number;
  dealsScored: number;
  elapsedMs: number;
}

/**
 * Map a project's constraints to RealEstateAPI MLS Search, hydrate each candidate,
 * compute pro-forma, persist deals + deal_scores. Service-role client required so
 * background runs (cron) bypass RLS while still scoping by `owner_id`.
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
  const reaKey = process.env.REALESTATEAPI_KEY;
  if (!reaKey) throw new Error("REALESTATEAPI_KEY not set");

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

  try {
    const rea = new RealEstateAPIClient({ apiKey: reaKey });
    const market = constraints.markets[0];
    if (!market) throw new Error("project has no market");

    const filters = buildFilters(constraints, market, options.size ?? 25);
    const search = await rea.mlsSearch(filters);
    const candidates = search.data;
    candidatesSeen = candidates.length;

    const hydrated = await hydrateInBatches(rea, candidates, MAX_HYDRATE_PARALLEL);

    const downPayment = constraints.downPayment ?? 0;
    const targetCashflow = constraints.targetMonthlyCashflow ?? 0;

    for (const { listing, detail } of hydrated) {
      if (!listing.id || !listing.price) continue;

      const price = listing.price;
      const effectiveDown =
        downPayment > 0 ? downPayment : price * (1 - constraints.mortgage.ltv);
      const monthlyRent =
        detail?.suggestedRent ??
        pickHudFmrRent(detail?.hudFairMarketRent, listing.beds ?? 3) ??
        estimateRentFromPrice(price);

      const proforma = computeProForma({
        price,
        downPayment: effectiveDown,
        rateAPR: constraints.mortgage.rateAPR,
        termYears: constraints.mortgage.termYears,
        interestOnly: constraints.mortgage.interestOnly ?? false,
        strategy: constraints.strategy,
        monthlyRentLTR: constraints.strategy === "LTR" ? monthlyRent : 0,
        monthlyADR:
          constraints.strategy === "STR"
            ? new Array(12).fill(monthlyRent / 30)
            : undefined,
      });

      const monthlyCashflow = proforma.annualPreTaxProfit / 12;
      const matchesDSCR = proforma.dscr >= constraints.minDSCR;
      const matchesCashflow =
        targetCashflow > 0 ? monthlyCashflow >= targetCashflow * 0.8 : true;
      if (!matchesDSCR || !matchesCashflow) continue;

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
            source: "realestateapi",
            source_property_id: listing.id,
            address: listing.address ?? null,
            city: listing.city ?? null,
            state: listing.state ?? null,
            zip: listing.zip ?? null,
            lat: detail?.lat ?? null,
            lng: detail?.lng ?? null,
            price: listing.price ?? null,
            beds: listing.beds ?? detail?.beds ?? null,
            baths: listing.baths ?? detail?.baths ?? null,
            sqft: listing.sqft ?? detail?.sqft ?? null,
            photos,
            primary_image_url: listing.primaryListingImageUrl ?? null,
            mls_data: listing.raw ?? null,
            est_value: detail?.estimatedValue ?? null,
            est_rent: monthlyRent,
            hud_fmr: detail?.hudFairMarketRent ?? null,
            last_refreshed_at: new Date().toISOString(),
          },
          { onConflict: "project_id,source,source_property_id" },
        )
        .select("id")
        .single();
      if (dealErr || !dealRow) continue;
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
    };
  } catch (err) {
    await sb
      .from("scout_runs")
      .update({
        finished_at: new Date().toISOString(),
        error: err instanceof Error ? err.message : String(err),
        candidates_seen: candidatesSeen,
        deals_added: dealsAdded,
        deals_scored: dealsScored,
      })
      .eq("id", runRow.id);
    throw err;
  }
}

function buildFilters(
  constraints: ProjectConstraints,
  market: Market,
  size: number,
) {
  const filters: Parameters<RealEstateAPIClient["mlsSearch"]>[0] = {
    size,
    status: "active",
  };
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
    filters.mls_listing_price_min = constraints.priceMin;
  if (constraints.priceMax !== undefined)
    filters.mls_listing_price_max = constraints.priceMax;
  if (constraints.bedsMin !== undefined) filters.beds_min = constraints.bedsMin;
  if (constraints.bathsMin !== undefined)
    filters.baths_min = constraints.bathsMin;
  if (constraints.sqftMin !== undefined) filters.sqft_min = constraints.sqftMin;
  if (
    constraints.propertyTypes.length &&
    !constraints.propertyTypes.includes("any")
  ) {
    filters.property_type = constraints.propertyTypes.map(mapPropertyType);
  }
  return filters;
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

function round(n: number, digits: number): number {
  if (!isFinite(n)) return 0;
  const f = Math.pow(10, digits);
  return Math.round(n * f) / f;
}
