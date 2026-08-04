import { NextResponse } from "next/server";

import { ensureDealPhotos } from "@/lib/deal-photos";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Lazy-fetch the full photo set for a HasData/Zillow deal and cache it
 * back into deals.photos so repeat visits are free. Costs 5 HasData
 * credits per deal the first time it's opened.
 *
 * Behaviour:
 *   - Auth required (uses RLS to scope by owner).
 *   - If deals.photos already has more than one photo, returns the cache.
 *   - Refuses non-hasdata sources (Zillow Property requires a Zillow URL).
 *   - On HasData failure, returns the cover photo we already had so the
 *     client can keep rendering without errors.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: dealId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: deal, error } = await supabase
    .from("deals")
    .select(
      "id, source, source_url, photos, primary_image_url, hoa_monthly, property_tax_rate, address, city, state, zip, mls_data",
    )
    .eq("id", dealId)
    .single();
  if (error || !deal) {
    return NextResponse.json({ error: "deal not found" }, { status: 404 });
  }

  const result = await ensureDealPhotos(supabase, deal);

  if (result.error && result.photos.length === 0) {
    return NextResponse.json(
      { photos: result.photos, error: result.error },
      { status: result.error.includes("HASDATA_API_KEY") ? 500 : 502 },
    );
  }

  return NextResponse.json({
    photos: result.photos,
    cached: result.cached,
    hoaMonthly: result.hoaMonthly,
    ...(result.error ? { error: result.error, note: result.error } : {}),
  });
}
