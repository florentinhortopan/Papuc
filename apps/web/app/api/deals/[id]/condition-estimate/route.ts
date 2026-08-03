import {
  CONDITION_DISCLAIMER,
  CONDITION_PHOTO_BATCH_SIZE,
  ClaudeProvider,
  aggregateConditionTotals,
  buildConditionSummary,
  mergeConditionBatch,
  normalizeConditionPhotoUrls,
  sliceConditionPhotoBatch,
  type ConditionFinding,
  type ConditionOverall,
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
/** One vision batch per invocation; client continues until done. */
export const maxDuration = 60;

/**
 * On-demand listing-photo condition / rehab estimate via Claude vision.
 *
 * Processes the gallery in batches of CONDITION_PHOTO_BATCH_SIZE so we
 * stay under the serverless time limit. Each response includes
 * `{ done, progress }`; the client re-calls until `done: true`.
 *
 * `?refresh=1` restarts from photo 0. Without refresh, a completed
 * analysis is returned from cache; an in-progress one continues.
 *
 * BILLING: gate via subscription_tier / usage meter before calling
 * Claude — profiles.subscription_tier already exists; enforce here when
 * Stripe metering ships.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    return await handleConditionEstimate(req, params);
  } catch (err) {
    console.error("[condition-estimate] unhandled:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

async function handleConditionEstimate(
  req: Request,
  params: Promise<{ id: string }>,
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
      "id, source, source_url, photos, primary_image_url, hoa_monthly, property_tax_rate, address, city, state, zip, beds, baths, sqft, price, est_value, mls_data, condition_findings, condition_summary, condition_rehab_low, condition_rehab_high, condition_rehab_suggested, condition_maintenance_monthly_suggested, condition_overall, condition_photo_count, condition_model, condition_disclaimer, condition_estimated_at, condition_status, condition_photos_total, condition_cursor",
    )
    .eq("id", dealId)
    .single();
  if (error || !deal) {
    const msg = error?.message ?? "deal not found";
    const missingCol = /condition_|column .* does not exist/i.test(msg);
    return NextResponse.json(
      {
        error: missingCol
          ? `Database is missing condition columns — run migrations (${msg})`
          : msg,
      },
      { status: missingCol ? 500 : 404 },
    );
  }

  if (
    !refresh &&
    deal.condition_status === "complete" &&
    deal.condition_estimated_at
  ) {
    return NextResponse.json(responsePayload(deal, { cached: true, done: true }));
  }

  // Expand the gallery before vision so we are not analyzing a single cover.
  const photoResult = await ensureDealPhotos(supabase, deal);
  const allPhotos = normalizeConditionPhotoUrls(photoResult.photos);
  if (allPhotos.length === 0) {
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

  const restart =
    refresh ||
    deal.condition_status !== "running" ||
    deal.condition_cursor == null ||
    deal.condition_photos_total !== allPhotos.length;

  const cursor = restart ? 0 : Number(deal.condition_cursor ?? 0);
  const priorFindings: ConditionFinding[] = restart
    ? []
    : Array.isArray(deal.condition_findings)
      ? (deal.condition_findings as ConditionFinding[])
      : [];
  const priorOverall = restart
    ? null
    : ((deal.condition_overall as ConditionOverall | null) ?? null);
  const priorMaintenance = restart
    ? null
    : deal.condition_maintenance_monthly_suggested != null
      ? Number(deal.condition_maintenance_monthly_suggested)
      : null;

  const { batch, nextCursor, done } = sliceConditionPhotoBatch(
    allPhotos,
    cursor,
    CONDITION_PHOTO_BATCH_SIZE,
  );
  if (batch.length === 0) {
    return NextResponse.json(
      { error: "no photos left to analyze" },
      { status: 400 },
    );
  }

  const batchCount = Math.ceil(allPhotos.length / CONDITION_PHOTO_BATCH_SIZE);
  const batchIndex = Math.floor(cursor / CONDITION_PHOTO_BATCH_SIZE);

  const fullAddress = [deal.address, deal.city, deal.state, deal.zip]
    .filter(Boolean)
    .join(", ");
  const price =
    typeof deal.price === "number" && deal.price > 0
      ? deal.price
      : typeof deal.est_value === "number" && deal.est_value > 0
        ? deal.est_value
        : undefined;

  console.info(
    "[condition-estimate] deal=%s batch=%d/%d photos=%d-%d/%d refresh=%s",
    dealId,
    batchIndex + 1,
    batchCount,
    cursor,
    nextCursor - 1,
    allPhotos.length,
    refresh,
  );

  try {
    const provider = new ClaudeProvider({ apiKey });
    const batchAssessment: PropertyConditionAssessment =
      await provider.analyzePropertyCondition({
        photoUrls: batch,
        address: fullAddress || undefined,
        beds: deal.beds ?? undefined,
        baths: deal.baths ?? undefined,
        sqft: deal.sqft ?? undefined,
        yearBuilt: yearBuiltFromMlsData(deal.mls_data),
        price,
        batch: {
          globalStartIndex: cursor,
          totalPhotos: allPhotos.length,
          batchIndex,
          batchCount,
        },
      });

    const merged = mergeConditionBatch({
      priorFindings,
      batch: batchAssessment,
      globalStartIndex: cursor,
      priorOverall,
      priorMaintenanceMonthly: priorMaintenance,
    });
    const totals = aggregateConditionTotals(
      merged.findings,
      merged.maintenanceMonthlySuggested,
    );
    const summary = buildConditionSummary({
      overall: merged.overall,
      findings: merged.findings,
      photosAnalyzed: nextCursor,
      photosTotal: allPhotos.length,
      complete: done,
    });
    const disclaimer = CONDITION_DISCLAIMER;
    const model = provider.modelId;
    const estimatedAt = done ? new Date().toISOString() : null;

    const { error: upErr } = await supabase
      .from("deals")
      .update({
        condition_findings: merged.findings,
        condition_summary: summary,
        condition_rehab_low: totals.rehabLow,
        condition_rehab_high: totals.rehabHigh,
        condition_rehab_suggested: totals.rehabSuggested,
        condition_maintenance_monthly_suggested:
          totals.maintenanceMonthlySuggested,
        condition_overall: merged.overall,
        condition_photo_count: nextCursor,
        condition_photos_total: allPhotos.length,
        condition_cursor: nextCursor,
        condition_status: done ? "complete" : "running",
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
      done,
      progress: {
        analyzed: nextCursor,
        total: allPhotos.length,
        batchIndex: batchIndex + 1,
        batchCount,
      },
      estimatedAt,
      overall: merged.overall,
      summary,
      findings: merged.findings,
      rehabLow: totals.rehabLow,
      rehabHigh: totals.rehabHigh,
      rehabSuggested: totals.rehabSuggested,
      maintenanceMonthlySuggested: totals.maintenanceMonthlySuggested,
      photoCount: nextCursor,
      photosTotal: allPhotos.length,
      model,
      disclaimer,
      applied: done
        ? {
            improvements: totals.rehabSuggested,
            maintenanceMonthly: totals.maintenanceMonthlySuggested,
          }
        : null,
    });
  } catch (err) {
    console.error("[condition-estimate] vision failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }
}

function responsePayload(
  deal: {
    condition_findings: unknown;
    condition_summary: string | null;
    condition_rehab_low: number | null;
    condition_rehab_high: number | null;
    condition_rehab_suggested: number | null;
    condition_maintenance_monthly_suggested: number | null;
    condition_overall: string | null;
    condition_photo_count: number | null;
    condition_photos_total: number | null;
    condition_model: string | null;
    condition_disclaimer: string | null;
    condition_estimated_at: string | null;
    condition_status: string | null;
  },
  opts: { cached: boolean; done: boolean },
) {
  const rehabSuggested = Number(deal.condition_rehab_suggested ?? 0);
  const maintenanceMonthlySuggested = Number(
    deal.condition_maintenance_monthly_suggested ?? 0,
  );
  const analyzed = Number(deal.condition_photo_count ?? 0);
  const total = Number(deal.condition_photos_total ?? analyzed);
  return {
    cached: opts.cached,
    done: opts.done,
    progress: {
      analyzed,
      total,
      batchIndex: null,
      batchCount: null,
    },
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
    photoCount: analyzed,
    photosTotal: total,
    model: deal.condition_model,
    disclaimer: deal.condition_disclaimer ?? CONDITION_DISCLAIMER,
    applied: opts.done
      ? {
          improvements: rehabSuggested,
          maintenanceMonthly: maintenanceMonthlySuggested,
        }
      : null,
  };
}
