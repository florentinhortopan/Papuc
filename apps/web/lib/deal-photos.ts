import {
  extractZillowAddress,
  HasDataClient,
  streetFromZillowUrl,
} from "@papuc/core";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Ensure a HasData/Zillow deal has its full photo gallery cached on
 * `deals.photos`. Costs 5 HasData credits the first time; subsequent
 * calls are free when more than one photo is already stored.
 *
 * Also opportunistically backfills HOA, property tax rate, and a missing
 * street address from cached mls_data or the property detail payload.
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
    address?: string | null;
    city?: string | null;
    state?: string | null;
    zip?: string | null;
    mls_data?: unknown;
  },
): Promise<{
  photos: string[];
  cached: boolean;
  hoaMonthly: number | null;
  error?: string;
}> {
  // Free repair: if a prior scout wrote null address but mls_data / URL
  // still has the street, persist it without spending HasData credits.
  await backfillAddressFromCache(supabase, deal);

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
    const shouldBackfillAddress =
      !deal.address?.trim() && Boolean(detail.address?.trim());

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
    if (shouldBackfillAddress) {
      update.address = detail.address;
      if (!deal.city && detail.city) update.city = detail.city;
      if (!deal.state && detail.state) update.state = detail.state;
      if (!deal.zip && detail.zip) update.zip = detail.zip;
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

async function backfillAddressFromCache(
  supabase: SupabaseClient,
  deal: {
    id: string;
    address?: string | null;
    city?: string | null;
    state?: string | null;
    zip?: string | null;
    source_url?: string | null;
    mls_data?: unknown;
  },
): Promise<void> {
  if (deal.address?.trim()) return;
  const fromMls =
    deal.mls_data && typeof deal.mls_data === "object"
      ? extractZillowAddress(deal.mls_data as Record<string, unknown>)
      : undefined;
  const street = fromMls ?? streetFromZillowUrl(deal.source_url);
  if (!street) return;

  const update: Record<string, unknown> = { address: street };
  if (
    deal.mls_data &&
    typeof deal.mls_data === "object" &&
    typeof (deal.mls_data as Record<string, unknown>).address === "object" &&
    (deal.mls_data as Record<string, unknown>).address !== null
  ) {
    const addr = (deal.mls_data as Record<string, unknown>).address as Record<
      string,
      unknown
    >;
    if (!deal.city && typeof addr.city === "string") update.city = addr.city;
    if (!deal.state && typeof addr.state === "string") update.state = addr.state;
    if (!deal.zip && typeof (addr.zipcode ?? addr.zip) === "string") {
      update.zip = (addr.zipcode ?? addr.zip) as string;
    }
  }
  update.last_refreshed_at = new Date().toISOString();
  await supabase.from("deals").update(update).eq("id", deal.id);
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
