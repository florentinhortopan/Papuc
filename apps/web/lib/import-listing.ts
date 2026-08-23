import {
  computeBaseScore,
  HasDataClient,
  parseListingUrl,
  propertyTaxRateForState,
  streetFromZillowUrl,
  type ProjectConstraints,
  type ZillowPropertyDetail,
} from "@papuc/core";
import type { SupabaseClient } from "@supabase/supabase-js";

import { getProject, type ProjectRow } from "./projects";
import { underwriteDeal, type UnderwritableDeal } from "./underwrite";

function round(n: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

function estimateRentFromPrice(price: number): number {
  return price * 0.007;
}

function isLandHomeType(homeType: string | undefined): boolean {
  if (!homeType) return false;
  return /lot|land|vacant/i.test(homeType);
}

/**
 * Fetch a Zillow property via HasData and upsert it onto an owned project
 * using the same underwrite path as scout / deal detail.
 */
export async function importListingFromUrl(
  sb: SupabaseClient,
  args: {
    userId: string;
    projectId: string;
    urlText: string;
  },
): Promise<
  | {
      ok: true;
      dealId: string;
      projectId: string;
      alreadyExisted: boolean;
      address: string | null;
      zpid: string | null;
      sourceUrl: string;
      monthlyCashflow: number;
      dscr: number;
      score: number;
    }
  | { ok: false; status: number; error: string; code?: string }
> {
  const parsed = parseListingUrl(args.urlText);
  if (!parsed.ok) {
    return {
      ok: false,
      status: 400,
      error: parsed.message,
      code: parsed.code,
    };
  }

  let project: ProjectRow;
  try {
    project = await getProject(sb, args.projectId);
  } catch {
    return { ok: false, status: 404, error: "project not found" };
  }
  if (project.owner_id !== args.userId) {
    return { ok: false, status: 403, error: "not your project" };
  }

  const apiKey = process.env.HASDATA_API_KEY;
  if (!apiKey) {
    return { ok: false, status: 500, error: "HASDATA_API_KEY not set" };
  }

  const client = new HasDataClient({ apiKey });
  let detail: ZillowPropertyDetail;
  try {
    detail = await client.getZillowProperty(parsed.canonicalUrl);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      status: 502,
      error: `Could not load that Zillow listing: ${msg}`,
      code: "provider_error",
    };
  }

  const zpid = (detail.zpid || parsed.zpid || "").trim();
  if (!zpid) {
    return {
      ok: false,
      status: 422,
      error: "Zillow response had no property id (zpid).",
      code: "missing_zpid",
    };
  }

  const sourceUrl = detail.url || parsed.canonicalUrl;
  const address =
    detail.address?.trim() ||
    streetFromZillowUrl(sourceUrl) ||
    null;
  const price = detail.price ?? null;
  const avm = detail.zestimate ?? null;
  const effectivePrice = price ?? avm;
  if (!effectivePrice || effectivePrice <= 0) {
    return {
      ok: false,
      status: 422,
      error: "Listing has no usable price or Zestimate.",
      code: "no_price",
    };
  }

  const monthlyRent =
    detail.rentZestimate && detail.rentZestimate > 0
      ? detail.rentZestimate
      : estimateRentFromPrice(effectivePrice);

  const isLand = isLandHomeType(detail.homeType);
  const propertyTaxRatePct =
    detail.propertyTaxRatePct ?? propertyTaxRateForState(detail.state);
  const hoaMonthly = detail.hoaMonthly;

  const mlsData = {
    ...(detail.raw && typeof detail.raw === "object" ? detail.raw : {}),
    homeType: detail.homeType,
    importedFromUrl: sourceUrl,
  };

  const dealForUnderwrite: UnderwritableDeal = {
    price,
    est_value: avm,
    est_rent: monthlyRent,
    state: detail.state ?? null,
    hoa_monthly: hoaMonthly ?? null,
    property_tax_rate: propertyTaxRatePct ?? null,
    mls_data: mlsData,
    str_adr: null,
    str_occupancy: null,
    str_monthly_distribution: null,
    str_estimated_at: null,
  };

  const constraints: ProjectConstraints = isLand
    ? { ...project.constraints, strategy: "LTR" }
    : project.constraints;

  const { seeds, result: proforma } = underwriteDeal(
    dealForUnderwrite,
    constraints,
  );
  const monthlyCashflow = proforma.annualPreTaxProfit / 12;
  const targetCashflow = constraints.targetMonthlyCashflow ?? 0;

  const { score: baseScore, components: scoreComponents } = computeBaseScore({
    dscr: proforma.dscr,
    monthlyCashflow,
    targetCashflow,
    cashOnCash: proforma.cashOnCashReturn,
    assetClass: isLand ? "land" : "rental",
    signals: {
      price: seeds.price,
      sqft: detail.sqft,
      hoaMonthly: hoaMonthly ?? undefined,
      photoCount: detail.photos?.length,
    },
  });

  const { data: existing } = await sb
    .from("deals")
    .select("id")
    .eq("project_id", project.id)
    .eq("source", "hasdata")
    .eq("source_property_id", zpid)
    .maybeSingle();

  const alreadyExisted = Boolean(existing?.id);
  const photos = detail.photos?.length ? detail.photos : [];

  const { data: dealRow, error: dealErr } = await sb
    .from("deals")
    .upsert(
      {
        project_id: project.id,
        source: "hasdata",
        source_property_id: zpid,
        address,
        city: detail.city ?? null,
        state: detail.state ?? null,
        zip: detail.zip ?? null,
        lat: detail.lat ?? null,
        lng: detail.lng ?? null,
        price,
        beds: detail.beds ?? null,
        baths: detail.baths ?? null,
        sqft: detail.sqft ?? null,
        photos,
        primary_image_url: photos[0] ?? null,
        source_url: sourceUrl,
        mls_data: mlsData,
        est_value: avm,
        est_rent: monthlyRent,
        hoa_monthly: hoaMonthly ?? null,
        property_tax_rate: propertyTaxRatePct ?? null,
        last_refreshed_at: new Date().toISOString(),
      },
      { onConflict: "project_id,source,source_property_id" },
    )
    .select("id")
    .single();

  if (dealErr || !dealRow) {
    return {
      ok: false,
      status: 500,
      error: dealErr?.message ?? "failed to save deal",
      code: "upsert_failed",
    };
  }

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
      score_components: scoreComponents,
      rationale: null,
      computed_proforma: proforma,
      computed_at: new Date().toISOString(),
    },
    { onConflict: "deal_id" },
  );

  if (scoreErr) {
    return {
      ok: false,
      status: 500,
      error: scoreErr.message,
      code: "score_failed",
    };
  }

  return {
    ok: true,
    dealId: dealRow.id as string,
    projectId: project.id,
    alreadyExisted,
    address,
    zpid,
    sourceUrl,
    monthlyCashflow,
    dscr: proforma.dscr,
    score: Math.round(baseScore),
  };
}
