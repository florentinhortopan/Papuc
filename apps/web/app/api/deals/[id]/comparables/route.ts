import { NextResponse } from "next/server";
import { RealEstateAPIClient } from "@papuc/core";

import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
    .select("source_property_id, project_id")
    .eq("id", dealId)
    .single();
  if (error || !deal) {
    return NextResponse.json({ error: "deal not found" }, { status: 404 });
  }

  const reaKey = process.env.REALESTATEAPI_KEY;
  if (!reaKey) {
    return NextResponse.json(
      { error: "REALESTATEAPI_KEY not set" },
      { status: 500 },
    );
  }

  try {
    const rea = new RealEstateAPIClient({ apiKey: reaKey });
    const comps = await rea.comparables(deal.source_property_id);
    return NextResponse.json({
      comparables: comps.slice(0, 10).map((c) => ({
        id: c.id,
        address: c.address,
        city: c.city,
        state: c.state,
        zip: c.zip,
        price: c.price,
        beds: c.beds,
        baths: c.baths,
        sqft: c.sqft,
        primaryListingImageUrl: c.primaryListingImageUrl,
        daysOnMarket: c.daysOnMarket,
      })),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }
}
