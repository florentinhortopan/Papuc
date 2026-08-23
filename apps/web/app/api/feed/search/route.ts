import { detectPropertyLookupIntent } from "@papuc/core";
import { ClaudeProvider } from "@papuc/core/llm";
import { NextResponse } from "next/server";

import { searchFeedDeals } from "@/lib/feed";
import { importListingFromQuery } from "@/lib/import-listing";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: { prompt?: string };
  try {
    body = (await req.json()) as { prompt?: string };
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const prompt = (body.prompt ?? "").trim();
  if (!prompt) {
    return NextResponse.json({ error: "prompt is required" }, { status: 400 });
  }

  // Specific listing URL / street address → import deal instead of feed scout.
  const lookup = detectPropertyLookupIntent(prompt);
  if (lookup) {
    const imported = await importListingFromQuery(supabase, {
      userId: user.id,
      query: lookup.kind === "url" ? lookup.value : lookup.value,
    });
    if (imported.ok) {
      return NextResponse.json({
        kind: "deal",
        prompt,
        dealId: imported.dealId,
        projectId: imported.projectId,
        address: imported.address,
        alreadyExisted: imported.alreadyExisted,
        score: imported.score,
        dscr: imported.dscr,
        monthlyCashflow: imported.monthlyCashflow,
      });
    }
    return NextResponse.json({
      kind: "property_miss",
      prompt,
      error: imported.error,
      code: imported.code,
    });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY not set" },
      { status: 500 },
    );
  }

  try {
    const claude = new ClaudeProvider({
      apiKey,
      model: process.env.ANTHROPIC_MODEL,
    });
    const constraints = await claude.parseProjectGoals(prompt);
    const deals = await searchFeedDeals(supabase, constraints);
    return NextResponse.json({
      kind: "feed",
      constraints,
      deals,
      prompt,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }
}
