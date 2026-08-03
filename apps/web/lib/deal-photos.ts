import { HasDataClient } from "@papuc/core";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Ensure a HasData/Zillow deal has its full photo gallery cached on
 * `deals.photos`. Costs 5 HasData credits the first time; subsequent
 * calls are free when more than one photo is already stored.
 *
 * Also opportunistically backfills HOA and property tax rate from the
 * property detail payload (same paid call).
 */
export async function ensureDealPhotos(
  supabase: SupabaseClient,
  deal: {
    id: string;
    source: string;
    source_url: string | null;
    photos: unknown;
    primary_image_url: string | null;
    hoa_monthly: number | null;
    property_tax_rate: number | null;
  },
): Promise<{
  photos: string[];
  cached: boolean;
  hoaMonthly: number | null;
  error?: string;
}> {
  const cached = Array.isArray(deal.photos) ? (deal.photos as string[]) : [];
  if (cached.length > 1) {
    return {
      photos: cached,
      cached: true,
      hoaMonthly: deal.hoa_monthly ?? null,
    };
  }

  if (deal.source !== "hasdata") {
    return {
      photos: cached,
      cached: true,
      hoaMonthly: deal.hoa_monthly ?? null,
      error: `Photo expansion only supported for HasData/Zillow deals (this one is ${deal.source}).`,
    };
  }

  if (!deal.source_url) {
    return {
      photos: cached,
      cached: true,
      hoaMonthly: deal.hoa_monthly ?? null,
      error: "deal has no source_url; re-scout to populate it",
    };
  }

  const apiKey = process.env.HASDATA_API_KEY;
  if (!apiKey) {
    return {
      photos: cached,
      cached: true,
      hoaMonthly: deal.hoa_monthly ?? null,
      error: "HASDATA_API_KEY not set",
    };
  }

  try {
    const client = new HasDataClient({ apiKey });
    const detail = await client.getZillowProperty(deal.source_url);
    const photos = detail.photos.length ? detail.photos : cached;

    const shouldBackfillHoa =
      detail.hoaMonthly !== undefined && deal.hoa_monthly == null;
    const shouldBackfillTaxRate =
      detail.propertyTaxRatePct !== undefined &&
      detail.propertyTaxRatePct !== deal.property_tax_rate;

    const update: Record<string, unknown> = {};
    if (photos.length > cached.length) {
      update.photos = photos;
      update.primary_image_url = photos[0] ?? deal.primary_image_url;
    }
    if (shouldBackfillHoa) {
      update.hoa_monthly = detail.hoaMonthly;
    }
    if (shouldBackfillTaxRate) {
      update.property_tax_rate = detail.propertyTaxRatePct;
    }
    if (Object.keys(update).length > 0) {
      update.last_refreshed_at = new Date().toISOString();
      await supabase.from("deals").update(update).eq("id", deal.id);
    }

    return {
      photos,
      cached: false,
      hoaMonthly: detail.hoaMonthly ?? deal.hoa_monthly ?? null,
    };
  } catch (err) {
    return {
      photos: cached,
      cached: true,
      hoaMonthly: deal.hoa_monthly ?? null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/** Best-effort yearBuilt from mls_data JSON (HasData/Zillow raw payload). */
export function yearBuiltFromMlsData(mlsData: unknown): number | undefined {
  if (!mlsData || typeof mlsData !== "object") return undefined;
  const o = mlsData as Record<string, unknown>;
  const direct = o.yearBuilt;
  if (typeof direct === "number" && Number.isFinite(direct) && direct > 1800) {
    return Math.round(direct);
  }
  if (typeof direct === "string") {
    const n = Number(direct);
    if (Number.isFinite(n) && n > 1800) return Math.round(n);
  }
  const nested = o.resoFacts;
  if (nested && typeof nested === "object") {
    const yb = (nested as Record<string, unknown>).yearBuilt;
    if (typeof yb === "number" && Number.isFinite(yb) && yb > 1800) {
      return Math.round(yb);
    }
  }
  return undefined;
}
