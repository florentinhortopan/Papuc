/**
 * Pure cache-policy helpers for the per-market STR intel cache
 * (`market_str_intel` table). Kept in core so the TTL/key semantics are
 * unit-testable; the Supabase read/write plumbing lives in
 * apps/web/lib/str-intel.ts.
 */

/** Refresh market research roughly quarterly. */
export const STR_INTEL_TTL_DAYS = 75;

/** Normalized "city, st" lower-case cache key. */
export function strIntelMarketKey(city: string, state: string): string {
  return `${city.trim().toLowerCase()}, ${state.trim().toLowerCase()}`;
}

/** Expiry timestamp for a row researched at `from` (default: now). */
export function strIntelExpiresAt(from: Date = new Date()): string {
  return new Date(
    from.getTime() + STR_INTEL_TTL_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();
}

/** A row is fresh while its expires_at is strictly in the future. */
export function isStrIntelFresh(
  expiresAt: string | Date,
  now: Date = new Date(),
): boolean {
  const t =
    typeof expiresAt === "string" ? Date.parse(expiresAt) : expiresAt.getTime();
  return Number.isFinite(t) && t > now.getTime();
}
