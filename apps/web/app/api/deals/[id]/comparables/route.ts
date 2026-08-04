import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { scoutComparablesForDeal } from "@/lib/scouting";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// HasData search + upsert can take a while on cold markets.
export const maxDuration = 120;

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: dealId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // RLS scopes deals to the caller's projects — a hit means they own it.
  const { data: deal, error } = await supabase
    .from("deals")
    .select("id, project_id")
    .eq("id", dealId)
    .single();
  if (error || !deal) {
    return NextResponse.json({ error: "deal not found" }, { status: 404 });
  }

  let body: {
    price?: number;
    beds?: number;
    baths?: number;
    sqft?: number;
    maxComps?: number;
  } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    body = {};
  }

  try {
    const admin = createAdminClient();
    const result = await scoutComparablesForDeal(admin, dealId, {
      price: typeof body.price === "number" ? body.price : undefined,
      beds: typeof body.beds === "number" ? body.beds : undefined,
      baths: typeof body.baths === "number" ? body.baths : undefined,
      sqft: typeof body.sqft === "number" ? body.sqft : undefined,
      maxComps: typeof body.maxComps === "number" ? body.maxComps : undefined,
    });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }
}
