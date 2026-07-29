import {
  isStrIntelFresh,
  strIntelExpiresAt,
  strIntelMarketKey,
} from "@papuc/core";
import { ClaudeProvider, type StrMarketIntel } from "@papuc/core/llm";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { MarketStrIntelRow } from "./database.types";

/**
 * Cached, web-search-backed STR market intelligence.
 *
 * One Claude research call (~$0.05) per market per TTL produces a
 * plausible ADR range + occupancy (used to sanity-check the scout's
 * rent-based ADR heuristic) and a regulation summary with official
 * permit/license links (shown on the deal detail page).
 *
 * Reads work with any client (RLS allows authenticated SELECT); writes
 * require the service-role client. Cache-policy helpers (key, TTL,
 * freshness) live in @papuc/core (`str-intel-cache.ts`).
 */

/** Don't let a cold-cache research call stall a scout for more than this. */
export const STR_INTEL_RESEARCH_TIMEOUT_MS = 45_000;

export async function getCachedMarketStrIntel(
  sb: SupabaseClient,
  city: string,
  state: string,
): Promise<MarketStrIntelRow | null> {
  const { data } = await sb
    .from("market_str_intel")
    .select("*")
    .eq("market_key", strIntelMarketKey(city, state))
    .maybeSingle();
  return (data as MarketStrIntelRow | null) ?? null;
}

/**
 * Return fresh cached intel, or research + upsert on miss/expiry.
 *
 * Failure policy: research problems (no API key, timeout, tool refusal)
 * degrade to the stale cached row when one exists, else null — callers
 * always keep working with the plain heuristic.
 */
export async function getOrResearchMarketStrIntel(
  sb: SupabaseClient,
  args: { city: string; state: string },
  opts: { timeoutMs?: number } = {},
): Promise<MarketStrIntelRow | null> {
  const cached = await getCachedMarketStrIntel(sb, args.city, args.state);
  if (cached && isStrIntelFresh(cached.expires_at)) return cached;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return cached;

  try {
    const claude = new ClaudeProvider({
      apiKey,
      model: process.env.ANTHROPIC_MODEL,
    });
    const timeoutMs = opts.timeoutMs ?? STR_INTEL_RESEARCH_TIMEOUT_MS;
    const intel = await withTimeout(
      claude.researchStrMarket({ city: args.city, state: args.state }),
      timeoutMs,
      `STR market research timed out after ${timeoutMs}ms`,
    );
    const row = await upsertMarketStrIntel(sb, args.city, args.state, intel);
    return row ?? cached;
  } catch (err) {
    console.warn(
      "[str-intel] research failed for %s, %s: %s",
      args.city,
      args.state,
      err instanceof Error ? err.message : String(err),
    );
    return cached;
  }
}

/** Requires a service-role client (RLS has no insert/update policy). */
export async function upsertMarketStrIntel(
  sb: SupabaseClient,
  city: string,
  state: string,
  intel: StrMarketIntel,
): Promise<MarketStrIntelRow | null> {
  const now = new Date();
  const { data, error } = await sb
    .from("market_str_intel")
    .upsert(
      {
        market_key: strIntelMarketKey(city, state),
        city: city.trim(),
        state: state.trim().toUpperCase(),
        adr_low: intel.adrLow ?? null,
        adr_median: intel.adrMedian ?? null,
        adr_high: intel.adrHigh ?? null,
        occupancy_avg: intel.occupancyAvg ?? null,
        seasonality_notes: intel.seasonalityNotes ?? null,
        regulation_status: intel.regulationStatus,
        regulation_summary: intel.regulationSummary ?? null,
        permit_required: intel.permitRequired ?? null,
        resource_links: intel.resourceLinks,
        sources: intel.sources,
        researched_at: now.toISOString(),
        expires_at: strIntelExpiresAt(now),
      },
      { onConflict: "market_key" },
    )
    .select("*")
    .single();
  if (error) {
    console.warn("[str-intel] upsert failed: %s", error.message);
    return null;
  }
  return data as MarketStrIntelRow;
}

function withTimeout<T>(p: Promise<T>, ms: number, msg: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(msg)), ms);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}
