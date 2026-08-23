import type { ListingAddressHint } from "./listing-url";
import type { ZillowListingSummary } from "./hasdata";

function normalizeAddrToken(s: string): string {
  return s
    .toLowerCase()
    .replace(/[.,#]/g, " ")
    .replace(
      /\b(street|st|avenue|ave|road|rd|boulevard|blvd|drive|dr|lane|ln|court|ct|way|place|pl|circle|cir|terrace|ter)\b/g,
      "",
    )
    .replace(/\s+/g, " ")
    .trim();
}

function streetTokens(s: string): string[] {
  return normalizeAddrToken(s)
    .split(" ")
    .filter((t) => t.length > 0);
}

/**
 * Score a Zillow search hit against an address hint. Higher is better.
 * Returns -1 when clearly incompatible (wrong zip/state/house number).
 */
export function scoreZillowAddressMatch(
  hit: ZillowListingSummary,
  hint: ListingAddressHint,
): number {
  const hitState = (hit.state ?? "").toUpperCase();
  const hintState = (hint.state ?? "").toUpperCase();
  if (hintState && hitState && hintState !== hitState) return -1;

  const hintZip = hint.zip?.slice(0, 5);
  const hitZip = (hit.zip ?? "").slice(0, 5);
  if (hintZip && hitZip && hintZip !== hitZip) return -1;

  let score = 0;
  if (hintZip && hitZip && hintZip === hitZip) score += 40;
  if (hintState && hitState && hintState === hitState) score += 15;

  const hintCity = normalizeAddrToken(hint.city ?? "");
  const hitCity = normalizeAddrToken(hit.city ?? "");
  if (hintCity && hitCity && hintCity === hitCity) score += 20;

  const hintStreet = hint.street ?? "";
  const hitStreet = hit.address ?? "";
  const hintToks = streetTokens(hintStreet);
  const hitNorm = normalizeAddrToken(hitStreet);
  let streetHits = 0;
  for (const t of hintToks) {
    if (t.length <= 1 && !/^\d+$/.test(t)) continue;
    if (hitNorm.includes(t)) streetHits += 1;
  }
  const scoredToks = hintToks.filter((t) => t.length > 1 || /^\d+$/.test(t));
  if (scoredToks.length > 0) {
    score += Math.round((streetHits / scoredToks.length) * 40);
  }

  const hintNum = hintStreet.match(/^\d+/);
  const hitNum = hitStreet.match(/^\d+/);
  if (hintNum && hitNum) {
    if (hintNum[0] === hitNum[0]) score += 25;
    else return -1;
  }

  return score;
}

export function pickZillowAddressMatch(
  listings: ZillowListingSummary[],
  hint: ListingAddressHint,
):
  | { ok: true; hit: ZillowListingSummary }
  | { ok: false; reason: "no_match" | "ambiguous" } {
  const scored = listings
    .filter((l) => l.zpid && (l.detailUrl || l.zpid))
    .map((hit) => ({ hit, score: scoreZillowAddressMatch(hit, hint) }))
    .filter((x) => x.score >= 50)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) return { ok: false, reason: "no_match" };
  const best = scored[0]!;
  const second = scored[1];
  if (
    second &&
    second.score >= best.score - 5 &&
    second.hit.zpid !== best.hit.zpid
  ) {
    return { ok: false, reason: "ambiguous" };
  }
  return { ok: true, hit: best.hit };
}
