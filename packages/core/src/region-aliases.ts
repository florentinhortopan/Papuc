import type { Market } from "./schemas";

/**
 * Extensible region → concrete city markets. Used by parse (Claude should
 * prefer emitting cities directly) and by scout expansion for `near` /
 * vague region leftovers. Keys are lowercase normalized phrases.
 */
export const REGION_ALIASES: Record<
  string,
  Array<{ city: string; state: string }>
> = {
  "east bay": [
    { city: "Oakland", state: "CA" },
    { city: "Berkeley", state: "CA" },
    { city: "Alameda", state: "CA" },
    { city: "Richmond", state: "CA" },
    { city: "Hayward", state: "CA" },
  ],
  "east bay ca": [
    { city: "Oakland", state: "CA" },
    { city: "Berkeley", state: "CA" },
    { city: "Alameda", state: "CA" },
    { city: "Richmond", state: "CA" },
  ],
  "sf bay area": [
    { city: "San Francisco", state: "CA" },
    { city: "Oakland", state: "CA" },
    { city: "San Jose", state: "CA" },
    { city: "Berkeley", state: "CA" },
  ],
  "bay area": [
    { city: "San Francisco", state: "CA" },
    { city: "Oakland", state: "CA" },
    { city: "San Jose", state: "CA" },
  ],
  "near sf": [
    { city: "Daly City", state: "CA" },
    { city: "Pacifica", state: "CA" },
    { city: "South San Francisco", state: "CA" },
    { city: "San Mateo", state: "CA" },
    { city: "Half Moon Bay", state: "CA" },
  ],
  "near san francisco": [
    { city: "Daly City", state: "CA" },
    { city: "Pacifica", state: "CA" },
    { city: "South San Francisco", state: "CA" },
    { city: "San Mateo", state: "CA" },
    { city: "Half Moon Bay", state: "CA" },
  ],
  "coastal near sf": [
    { city: "Pacifica", state: "CA" },
    { city: "Half Moon Bay", state: "CA" },
    { city: "Santa Cruz", state: "CA" },
  ],
  "lake tahoe": [
    { city: "South Lake Tahoe", state: "CA" },
    { city: "Tahoe City", state: "CA" },
    { city: "Truckee", state: "CA" },
  ],
  "near tahoe": [
    { city: "South Lake Tahoe", state: "CA" },
    { city: "Truckee", state: "CA" },
    { city: "Incline Village", state: "NV" },
  ],
  "twin cities": [
    { city: "Minneapolis", state: "MN" },
    { city: "Saint Paul", state: "MN" },
  ],
  "dmv": [
    { city: "Washington", state: "DC" },
    { city: "Arlington", state: "VA" },
    { city: "Alexandria", state: "VA" },
    { city: "Bethesda", state: "MD" },
  ],
};

function normalizePlaceKey(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function lookupRegionAlias(
  place: string,
): Array<{ city: string; state: string }> | null {
  const key = normalizePlaceKey(place);
  if (REGION_ALIASES[key]) return REGION_ALIASES[key]!;
  // Soft contains: "somewhere in the east bay" → east bay
  for (const [alias, cities] of Object.entries(REGION_ALIASES)) {
    if (key.includes(alias) || alias.includes(key)) return cities;
  }
  return null;
}

function marketKey(m: Market): string {
  if (m.kind === "city") return `city:${m.city.toLowerCase()},${m.state.toUpperCase()}`;
  if (m.kind === "zip") return `zip:${m.zip}`;
  if (m.kind === "county")
    return `county:${m.county.toLowerCase()},${m.state.toUpperCase()}`;
  if (m.kind === "state") return `state:${m.state.toUpperCase()}`;
  if (m.kind === "near")
    return `near:${m.place.toLowerCase()}:${m.state ?? ""}:${m.radiusMiles ?? 30}`;
  return `poly:${m.polygon.length}`;
}

/**
 * Expand `near` / known region phrases into concrete city markets for
 * scouting. Passes through already-concrete markets. Caps list length.
 */
export function expandMarketsForScout(
  markets: Market[],
  maxMarkets = 5,
): Market[] {
  const out: Market[] = [];
  const seen = new Set<string>();

  const push = (m: Market) => {
    if (out.length >= maxMarkets) return;
    const k = marketKey(m);
    if (seen.has(k)) return;
    seen.add(k);
    out.push(m);
  };

  for (const m of markets) {
    if (out.length >= maxMarkets) break;
    if (m.kind === "near") {
      const alias = lookupRegionAlias(m.place);
      if (alias) {
        for (const c of alias) push({ kind: "city", city: c.city, state: c.state });
      } else if (m.state) {
        // Unknown place but state given — fall back to a city guess from place text
        const cityGuess = m.place
          .replace(/\bnear\b/gi, "")
          .replace(/\b(ca|tx|ny|fl|or|wa|co|nv|az)\b/gi, "")
          .trim();
        if (cityGuess) {
          push({ kind: "city", city: cityGuess, state: m.state.toUpperCase() });
        } else {
          push({ kind: "state", state: m.state.toUpperCase() });
        }
      }
      continue;
    }
    // Also expand bare city names that are really region aliases
    if (m.kind === "city") {
      const asRegion = lookupRegionAlias(`${m.city} ${m.state}`);
      const asCityOnly = lookupRegionAlias(m.city);
      if (
        asRegion &&
        /bay|east bay|dmv|twin cities|tahoe/i.test(m.city)
      ) {
        for (const c of asRegion) push({ kind: "city", city: c.city, state: c.state });
        continue;
      }
      if (asCityOnly && /east bay|bay area|dmv/i.test(m.city)) {
        for (const c of asCityOnly) push({ kind: "city", city: c.city, state: c.state });
        continue;
      }
    }
    push(m);
  }

  return out.length > 0 ? out : markets.slice(0, maxMarkets);
}
