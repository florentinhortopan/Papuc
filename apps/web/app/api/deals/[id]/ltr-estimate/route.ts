import {
  aggregateLtrRentFromListings,
  buildLtrRentCompFilters,
  HasDataClient,
  LTR_RENT_ESTIMATE_SOURCE,
  LTR_RENT_MIN_COMPS,
} from "@papuc/core";
import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * On-demand LTR rent comps for a deal via HasData Zillow forRent search.
 * Result is cached on `deals.ltr_*` (and `est_rent` is updated to the
 * median). `?refresh=1` forces a fresh search.
 *
 * Auth: session client — RLS scopes the deal to its owner.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: dealId } = await params;
  const refresh = new URL(req.url).searchParams.get("refresh") === "1";
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: deal, error } = await supabase
    .from("deals")
    .select(
      "id, address, city, state, zip, beds, baths, sqft, mls_data, ltr_rent_median, ltr_rent_p25, ltr_rent_p75, ltr_comp_count, ltr_estimate_source, ltr_estimated_at",
    )
    .eq("id", dealId)
    .single();
  if (error || !deal) {
    return NextResponse.json({ error: "deal not found" }, { status: 404 });
  }

  if (deal.ltr_estimated_at && deal.ltr_rent_median != null && !refresh) {
    return NextResponse.json({
      cached: true,
      estimatedAt: deal.ltr_estimated_at,
      median: Number(deal.ltr_rent_median),
      p25: deal.ltr_rent_p25 != null ? Number(deal.ltr_rent_p25) : null,
      p75: deal.ltr_rent_p75 != null ? Number(deal.ltr_rent_p75) : null,
      comparableCount: deal.ltr_comp_count ?? 0,
      source: deal.ltr_estimate_source ?? LTR_RENT_ESTIMATE_SOURCE,
    });
  }

  const mls =
    deal.mls_data && typeof deal.mls_data === "object"
      ? (deal.mls_data as Record<string, unknown>)
      : {};
  const homeType =
    typeof mls.homeType === "string"
      ? mls.homeType
      : typeof mls.home_type === "string"
        ? mls.home_type
        : null;

  if (homeType && /^(LOT|LAND)$/i.test(homeType)) {
    return NextResponse.json(
      { error: "Vacant land has no rental comps — LTR rent estimate is not available." },
      { status: 400 },
    );
  }

  const apiKey = process.env.HASDATA_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "HASDATA_API_KEY not set — add it to enable LTR rent comps" },
      { status: 500 },
    );
  }

  let filters;
  try {
    filters = buildLtrRentCompFilters({
      city: deal.city,
      state: deal.state,
      zip: deal.zip,
      beds: deal.beds != null ? Number(deal.beds) : null,
      homeType,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 },
    );
  }

  try {
    const client = new HasDataClient({ apiKey });
    const result = await client.searchZillow(filters);
    const stats = aggregateLtrRentFromListings(result.data);

    if (!stats) {
      return NextResponse.json(
        {
          error: `Need at least ${LTR_RENT_MIN_COMPS} for-rent comps with a rent price; found ${result.data.length} listings in this area.`,
          query: filters,
          listingsSeen: result.data.length,
        },
        { status: 422 },
      );
    }

    const estimatedAt = new Date().toISOString();
    const compsSample = result.data.slice(0, 5).map((row) => ({
      address: row.address,
      city: row.city,
      rent: row.price ?? row.rentZestimate ?? null,
      beds: row.beds,
      baths: row.baths,
      detailUrl: row.detailUrl,
    }));

    const { error: upErr } = await supabase
      .from("deals")
      .update({
        ltr_rent_median: stats.median,
        ltr_rent_p25: stats.p25,
        ltr_rent_p75: stats.p75,
        ltr_comp_count: stats.comparableCount,
        ltr_estimate_source: LTR_RENT_ESTIMATE_SOURCE,
        ltr_estimated_at: estimatedAt,
        est_rent: stats.median,
      })
      .eq("id", dealId);
    if (upErr) {
      console.warn("[ltr-estimate] cache write failed: %s", upErr.message);
    }

    return NextResponse.json({
      cached: false,
      estimatedAt,
      median: stats.median,
      p25: stats.p25,
      p75: stats.p75,
      comparableCount: stats.comparableCount,
      source: LTR_RENT_ESTIMATE_SOURCE,
      query: filters,
      compsSample,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }
}
