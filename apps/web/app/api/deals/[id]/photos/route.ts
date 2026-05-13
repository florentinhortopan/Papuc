import { HasDataClient } from "@papuc/core";
import { NextResponse } from "next/server";

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
      "id, source, source_url, photos, primary_image_url, hoa_monthly, address, city, state, zip",
    )
    .eq("id", dealId)
    .single();
  if (error || !deal) {
    return NextResponse.json({ error: "deal not found" }, { status: 404 });
  }

  const cached = Array.isArray(deal.photos) ? (deal.photos as string[]) : [];
  if (cached.length > 1) {
    return NextResponse.json({ photos: cached, cached: true });
  }

  if (deal.source !== "hasdata") {
    return NextResponse.json({
      photos: cached,
      note: `Photo expansion only supported for HasData/Zillow deals (this one is ${deal.source}).`,
    });
  }

  if (!deal.source_url) {
    return NextResponse.json({
      photos: cached,
      error: "deal has no source_url; re-scout to populate it",
    });
  }

  const apiKey = process.env.HASDATA_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "HASDATA_API_KEY not set" },
      { status: 500 },
    );
  }

  try {
    const client = new HasDataClient({ apiKey });
    const detail = await client.getZillowProperty(deal.source_url);
    const photos = detail.photos.length ? detail.photos : cached;

    // Opportunistically backfill HOA when the property detail exposes one
    // and we didn't already capture it during scouting (listings often
    // omit it). This keeps a single paid call doing double duty.
    const shouldBackfillHoa =
      detail.hoaMonthly !== undefined && deal.hoa_monthly == null;

    const update: Record<string, unknown> = {};
    if (photos.length > cached.length) {
      update.photos = photos;
      update.primary_image_url = photos[0] ?? deal.primary_image_url;
    }
    if (shouldBackfillHoa) {
      update.hoa_monthly = detail.hoaMonthly;
    }
    if (Object.keys(update).length > 0) {
      update.last_refreshed_at = new Date().toISOString();
      await supabase.from("deals").update(update).eq("id", dealId);
    }

    return NextResponse.json({
      photos,
      cached: false,
      hoaMonthly: detail.hoaMonthly ?? deal.hoa_monthly ?? null,
    });
  } catch (err) {
    return NextResponse.json(
      {
        photos: cached,
        error: err instanceof Error ? err.message : String(err),
      },
      { status: 502 },
    );
  }
}
