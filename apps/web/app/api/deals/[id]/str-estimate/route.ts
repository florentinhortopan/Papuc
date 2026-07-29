import { AirRoiClient } from "@papuc/core";
import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * On-demand comps-based STR estimate for a deal via AirROI
 * `/calculator/estimate` — $0.20 per call, so it only runs when the user
 * explicitly clicks the button on the deal detail page. The result is
 * cached in `deals.str_*` (returned free on subsequent opens and reused
 * by future scout runs); `?refresh=1` forces a paid re-fetch.
 *
 * Auth: normal session client — RLS scopes the deal to its owner, and the
 * same RLS-checked update writes the cache back.
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
      "id, address, city, state, zip, lat, lng, beds, baths, str_adr, str_occupancy, str_annual_revenue, str_percentiles, str_monthly_distribution, str_estimated_at",
    )
    .eq("id", dealId)
    .single();
  if (error || !deal) {
    return NextResponse.json({ error: "deal not found" }, { status: 404 });
  }

  if (deal.str_estimated_at && !refresh) {
    return NextResponse.json({
      cached: true,
      estimatedAt: deal.str_estimated_at,
      adr: deal.str_adr,
      occupancy: deal.str_occupancy,
      annualRevenue: deal.str_annual_revenue,
      percentiles: deal.str_percentiles,
      monthlyRevenueDistribution: deal.str_monthly_distribution,
    });
  }

  const apiKey = process.env.AIRROI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "AIRROI_API_KEY not set — add it to enable comps-based STR estimates" },
      { status: 500 },
    );
  }

  const fullAddress = [deal.address, deal.city, deal.state, deal.zip]
    .filter(Boolean)
    .join(", ");
  const hasCoords = typeof deal.lat === "number" && typeof deal.lng === "number";
  if (!fullAddress && !hasCoords) {
    return NextResponse.json(
      { error: "deal has no address or coordinates to estimate from" },
      { status: 400 },
    );
  }

  try {
    const client = new AirRoiClient({ apiKey });
    const estimate = await client.estimateRevenue({
      // Prefer the address (geocoded server-side by AirROI); coordinates
      // are the fallback for deals whose address failed to normalize.
      ...(fullAddress
        ? { address: fullAddress }
        : { lat: deal.lat as number, lng: deal.lng as number }),
      bedrooms: Number(deal.beds ?? 2),
      baths: Number(deal.baths ?? 1),
    });

    const estimatedAt = new Date().toISOString();
    const { error: upErr } = await supabase
      .from("deals")
      .update({
        str_adr: estimate.adr,
        str_occupancy: estimate.occupancy,
        str_annual_revenue: estimate.annualRevenue,
        str_percentiles: estimate.percentiles,
        str_monthly_distribution: estimate.monthlyRevenueDistribution ?? null,
        str_estimate_source: "airroi",
        str_estimated_at: estimatedAt,
      })
      .eq("id", dealId);
    if (upErr) {
      // The user paid for the call — return the data even if caching failed.
      console.warn("[str-estimate] cache write failed: %s", upErr.message);
    }

    return NextResponse.json({
      cached: false,
      estimatedAt,
      adr: estimate.adr,
      occupancy: estimate.occupancy,
      annualRevenue: estimate.annualRevenue,
      percentiles: estimate.percentiles,
      monthlyRevenueDistribution: estimate.monthlyRevenueDistribution ?? null,
      comparableCount: estimate.comparableCount,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }
}
