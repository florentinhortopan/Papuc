// Edge Function: scout-project
// Input: { projectId: string }
// Output: { dealsAdded: number, candidatesSeen: number, scoutRunId: string }
//
// 1. Load project + constraints
// 2. Map constraints -> RealEstateAPI MLS Search filters
// 3. Hydrate top N candidates via Property Detail (rent + AVM + photos)
// 4. Compute pro-forma + DSCR + cash-on-cash for each
// 5. Filter to deals matching minDSCR and (if set) targetMonthlyCashflow
// 6. Persist deals + deal_scores
// 7. Invoke rank-deals to populate Claude rationales

import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { authedUser, getServiceClient } from "../_shared/supabase.ts";
import { RealEstateAPIClient, type MLSListingSummary, type PropertyDetail } from "../_shared/realestate.ts";
import { computeProForma } from "../_shared/proforma.ts";
import type { Market, ProjectConstraints } from "../_shared/types.ts";

interface ScoutRequest {
  projectId: string;
  size?: number;
}

const MAX_HYDRATE_PARALLEL = 5;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "method not allowed" }, 405);

  const user = await authedUser(req);
  if (!user) return jsonResponse({ error: "unauthorized" }, 401);

  let body: ScoutRequest;
  try {
    body = (await req.json()) as ScoutRequest;
  } catch {
    return jsonResponse({ error: "invalid JSON" }, 400);
  }
  if (!body.projectId) return jsonResponse({ error: "projectId required" }, 400);

  const reaKey = Deno.env.get("REALESTATEAPI_KEY");
  if (!reaKey) return jsonResponse({ error: "REALESTATEAPI_KEY not set" }, 500);

  const sb = getServiceClient();

  const { data: project, error: pErr } = await sb
    .from("projects")
    .select("*")
    .eq("id", body.projectId)
    .eq("owner_id", user.userId)
    .single();
  if (pErr || !project) return jsonResponse({ error: "project not found" }, 404);

  const constraints = project.constraints as ProjectConstraints;

  const { data: runRow, error: runErr } = await sb
    .from("scout_runs")
    .insert({
      project_id: project.id,
      triggered_by: user.userId,
      trigger_kind: "manual",
    })
    .select("id")
    .single();
  if (runErr || !runRow) return jsonResponse({ error: "could not start scout run" }, 500);

  const startedAt = Date.now();
  let candidatesSeen = 0;
  let dealsAdded = 0;
  let dealsScored = 0;

  try {
    const rea = new RealEstateAPIClient({ apiKey: reaKey });

    const market = constraints.markets[0];
    if (!market) throw new Error("project has no market");

    const filters = buildFilters(constraints, market, body.size ?? 25);
    const candidates = await rea.mlsSearch(filters);
    candidatesSeen = candidates.length;

    const hydrated = await hydrateInBatches(rea, candidates, MAX_HYDRATE_PARALLEL);

    const downPayment = constraints.downPayment ?? 0;
    const targetCashflow = constraints.targetMonthlyCashflow ?? 0;

    for (const { listing, detail } of hydrated) {
      if (!listing.id || !listing.price) continue;

      const price = listing.price;
      const effectiveDown = downPayment > 0 ? downPayment : price * (1 - constraints.mortgage.ltv);
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
      const matchesCashflow = targetCashflow > 0 ? monthlyCashflow >= targetCashflow * 0.8 : true;
      if (!matchesDSCR || !matchesCashflow) continue;

      const baseScore = computeBaseScore({
        dscr: proforma.dscr,
        monthlyCashflow,
        targetCashflow,
        cashOnCash: proforma.cashOnCashReturn,
      });

      const photos = listing.photosList?.map((p) => p.url) ?? (detail?.photos ?? []);

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
            lat: listing.lat ?? detail?.lat ?? null,
            lng: listing.lng ?? detail?.lng ?? null,
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

    // Update project + scout run
    await sb.from("projects").update({ last_scout_at: new Date().toISOString() }).eq("id", project.id);
    await sb
      .from("scout_runs")
      .update({
        finished_at: new Date().toISOString(),
        candidates_seen: candidatesSeen,
        deals_added: dealsAdded,
        deals_scored: dealsScored,
      })
      .eq("id", runRow.id);

    // Fire-and-forget rank-deals to add Claude rationales (best effort).
    void invokeRankDeals(req, project.id).catch(() => {});

    return jsonResponse({
      scoutRunId: runRow.id,
      candidatesSeen,
      dealsAdded,
      dealsScored,
      elapsedMs: Date.now() - startedAt,
    });
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
    return jsonResponse(
      { error: err instanceof Error ? err.message : String(err) },
      500,
    );
  }
});

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
  if (constraints.bathsMin !== undefined) filters.baths_min = constraints.bathsMin;
  if (constraints.sqftMin !== undefined) filters.sqft_min = constraints.sqftMin;
  if (constraints.propertyTypes.length && !constraints.propertyTypes.includes("any")) {
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
  const out: Array<{ listing: MLSListingSummary; detail: PropertyDetail | null }> = [];
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

// Rough fallback: 1% rule (monthly rent ~ 0.7% of price for SFR currently).
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

async function invokeRankDeals(req: Request, projectId: string): Promise<void> {
  const url = Deno.env.get("SUPABASE_URL");
  const auth = req.headers.get("authorization") ?? "";
  if (!url || !auth) return;
  await fetch(`${url}/functions/v1/rank-deals`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: auth },
    body: JSON.stringify({ projectId }),
  });
}
