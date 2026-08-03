import {
  CONDITION_DISCLAIMER,
  ClaudeProvider,
  selectConditionPhotoUrls,
  type PropertyConditionAssessment,
} from "@papuc/core/llm";
import { NextResponse } from "next/server";

import {
  ensureDealPhotos,
  yearBuiltFromMlsData,
} from "@/lib/deal-photos";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Multi-image vision can take a while; keep the serverless window open. */
export const maxDuration = 60;

/**
 * On-demand listing-photo condition / rehab estimate via Claude vision.
 * Only runs when the user explicitly clicks "Analyze photos" on deal
 * detail. Result is cached on `deals.condition_*`; `?refresh=1` forces
 * a re-run.
 *
 * BILLING: gate via subscription_tier / usage meter before calling
 * Claude — profiles.subscription_tier already exists; enforce here when
 * Stripe metering ships. v1 is click-gated + DB-cached only.
 *
 * Auth: normal session client — RLS scopes the deal to its owner.
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

  // BILLING: if (profile.subscription_tier !== "pro") return 402 …

  const { data: deal, error } = await supabase
    .from("deals")
    .select(
      "id, source, source_url, photos, primary_image_url, hoa_monthly, property_tax_rate, address, city, state, zip, beds, baths, sqft, price, est_value, mls_data, condition_findings, condition_summary, condition_rehab_low, condition_rehab_high, condition_rehab_suggested, condition_maintenance_monthly_suggested, condition_overall, condition_photo_count, condition_model, condition_disclaimer, condition_estimated_at",
    )
    .eq("id", dealId)
    .single();
  if (error || !deal) {
    return NextResponse.json({ error: "deal not found" }, { status: 404 });
  }

  if (deal.condition_estimated_at && !refresh) {
    return NextResponse.json(cachedPayload(deal, true));
  }

  // Expand the gallery before vision so we are not analyzing a single cover.
  const photoResult = await ensureDealPhotos(supabase, deal);
  const photos = selectConditionPhotoUrls(photoResult.photos);
  if (photos.length === 0) {
    return NextResponse.json(
      {
        error:
          photoResult.error ??
          "deal has no listing photos to analyze — open the deal to load photos first",
      },
      { status: 400 },
    );
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "ANTHROPIC_API_KEY not set — add it to enable photo condition analysis",
      },
      { status: 500 },
    );
  }

  const fullAddress = [deal.address, deal.city, deal.state, deal.zip]
    .filter(Boolean)
    .join(", ");
  const price =
    typeof deal.price === "number" && deal.price > 0
      ? deal.price
      : typeof deal.est_value === "number" && deal.est_value > 0
        ? deal.est_value
        : undefined;

  try {
    const provider = new ClaudeProvider({ apiKey });
    const assessment: PropertyConditionAssessment =
      await provider.analyzePropertyCondition({
        photoUrls: photos,
        address: fullAddress || undefined,
        beds: deal.beds ?? undefined,
        baths: deal.baths ?? undefined,
        sqft: deal.sqft ?? undefined,
        yearBuilt: yearBuiltFromMlsData(deal.mls_data),
        price,
      });

    const estimatedAt = new Date().toISOString();
    const model = provider.modelId;
    const disclaimer = assessment.disclaimer ?? CONDITION_DISCLAIMER;

    const { error: upErr } = await supabase
      .from("deals")
      .update({
        condition_findings: assessment.findings,
        condition_summary: assessment.summary,
        condition_rehab_low: assessment.rehabLow,
        condition_rehab_high: assessment.rehabHigh,
        condition_rehab_suggested: assessment.rehabSuggested,
        condition_maintenance_monthly_suggested:
          assessment.maintenanceMonthlySuggested,
        condition_overall: assessment.overall,
        condition_photo_count: photos.length,
        condition_model: model,
        condition_disclaimer: disclaimer,
        condition_estimated_at: estimatedAt,
      })
      .eq("id", dealId);
    if (upErr) {
      console.warn("[condition-estimate] cache write failed: %s", upErr.message);
    }

    return NextResponse.json({
      cached: false,
      estimatedAt,
      overall: assessment.overall,
      summary: assessment.summary,
      findings: assessment.findings,
      rehabLow: assessment.rehabLow,
      rehabHigh: assessment.rehabHigh,
      rehabSuggested: assessment.rehabSuggested,
      maintenanceMonthlySuggested: assessment.maintenanceMonthlySuggested,
      photoCount: photos.length,
      model,
      disclaimer,
      applied: {
        improvements: assessment.rehabSuggested,
        maintenanceMonthly: assessment.maintenanceMonthlySuggested,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }
}

function cachedPayload(
  deal: {
    condition_findings: unknown;
    condition_summary: string | null;
    condition_rehab_low: number | null;
    condition_rehab_high: number | null;
    condition_rehab_suggested: number | null;
    condition_maintenance_monthly_suggested: number | null;
    condition_overall: string | null;
    condition_photo_count: number | null;
    condition_model: string | null;
    condition_disclaimer: string | null;
    condition_estimated_at: string | null;
  },
  cached: boolean,
) {
  const rehabSuggested = Number(deal.condition_rehab_suggested ?? 0);
  const maintenanceMonthlySuggested = Number(
    deal.condition_maintenance_monthly_suggested ?? 0,
  );
  return {
    cached,
    estimatedAt: deal.condition_estimated_at,
    overall: deal.condition_overall,
    summary: deal.condition_summary,
    findings: Array.isArray(deal.condition_findings)
      ? deal.condition_findings
      : [],
    rehabLow: deal.condition_rehab_low,
    rehabHigh: deal.condition_rehab_high,
    rehabSuggested,
    maintenanceMonthlySuggested,
    photoCount: deal.condition_photo_count,
    model: deal.condition_model,
    disclaimer: deal.condition_disclaimer ?? CONDITION_DISCLAIMER,
    applied: {
      improvements: rehabSuggested,
      maintenanceMonthly: maintenanceMonthlySuggested,
    },
  };
}
