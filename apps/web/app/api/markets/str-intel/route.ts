import { NextResponse } from "next/server";

import { getOrResearchMarketStrIntel } from "@/lib/str-intel";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// The web-search research call can take ~30-45s on a cache miss.
export const maxDuration = 60;

/**
 * GET /api/markets/str-intel?city=...&state=...
 *
 * Returns cached STR market intelligence (ADR range, occupancy,
 * regulation summary + official permit links) for a US market,
 * researching it via Claude + web search on cache miss/expiry
 * (~$0.05, cached ~75 days).
 *
 * Auth: any signed-in user. The research upsert needs the service-role
 * client because market_str_intel is read-only under RLS.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const city = url.searchParams.get("city")?.trim();
  const state = url.searchParams.get("state")?.trim();
  if (!city || !state) {
    return NextResponse.json(
      { error: "city and state query params required" },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const intel = await getOrResearchMarketStrIntel(admin, { city, state });
  if (!intel) {
    return NextResponse.json(
      { error: "no intel available for this market yet (research failed or ANTHROPIC_API_KEY unset)" },
      { status: 502 },
    );
  }

  return NextResponse.json({ intel });
}
