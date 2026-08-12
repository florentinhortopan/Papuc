import type { ProjectConstraints } from "@papuc/core";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { DealScoresRow, DealsRow } from "./database.types";

const SECTION_LIMIT = 12;
/** Over-fetch then dedupe so each section still fills after collisions. */
const FETCH_LIMIT = 40;

export type FeedProjectRef = {
  id: string;
  name: string;
  owner_id: string;
};

export type FeedDeal = DealsRow & {
  score: DealScoresRow | null;
  project: FeedProjectRef;
};

export type FeedSections = {
  bestRated: FeedDeal[];
  mostProfitable: FeedDeal[];
  latest: FeedDeal[];
};

type RawFeedRow = DealsRow & {
  deal_scores: DealScoresRow[] | DealScoresRow | null;
  projects: FeedProjectRef | FeedProjectRef[] | null;
};

function pickScore(row: RawFeedRow): DealScoresRow | null {
  const s = row.deal_scores;
  if (!s) return null;
  if (Array.isArray(s)) return s[0] ?? null;
  return s;
}

function pickProject(row: RawFeedRow): FeedProjectRef | null {
  const p = row.projects;
  if (!p) return null;
  if (Array.isArray(p)) return p[0] ?? null;
  return p;
}

function toFeedDeal(row: RawFeedRow): FeedDeal | null {
  const project = pickProject(row);
  if (!project || !project.id) return null;
  const { deal_scores: _scores, projects: _projects, ...deal } = row;
  return {
    ...(deal as DealsRow),
    score: pickScore(row),
    project,
  };
}

function listingKey(deal: FeedDeal): string {
  return `${deal.source}:${deal.source_property_id}`;
}

/** Keep highest Papuc score per listing identity within a section. */
function dedupeByListing(deals: FeedDeal[], limit: number): FeedDeal[] {
  const best = new Map<string, FeedDeal>();
  for (const deal of deals) {
    const key = listingKey(deal);
    const prev = best.get(key);
    if (!prev) {
      best.set(key, deal);
      continue;
    }
    const prevScore = prev.score?.score ?? -1;
    const nextScore = deal.score?.score ?? -1;
    if (nextScore > prevScore) best.set(key, deal);
  }
  return Array.from(best.values()).slice(0, limit);
}

async function fetchPublicDeals(
  supabase: SupabaseClient,
  order: { column: string; ascending: boolean; foreignTable?: string },
): Promise<FeedDeal[]> {
  let query = supabase
    .from("deals")
    .select(
      "*, deal_scores(*), projects!inner(id, name, owner_id, is_public)",
    )
    .eq("projects.is_public", true)
    .limit(FETCH_LIMIT);

  if (order.foreignTable) {
    query = query.order(order.column, {
      ascending: order.ascending,
      foreignTable: order.foreignTable,
      nullsFirst: false,
    });
  } else {
    query = query.order(order.column, {
      ascending: order.ascending,
      nullsFirst: false,
    });
  }

  const { data, error } = await query;
  if (error) throw error;

  const mapped = ((data ?? []) as unknown as RawFeedRow[])
    .map(toFeedDeal)
    .filter((d): d is FeedDeal => d !== null);

  return dedupeByListing(mapped, SECTION_LIMIT);
}

export async function listFeedSections(
  supabase: SupabaseClient,
): Promise<FeedSections> {
  const [bestRated, mostProfitable, latest] = await Promise.all([
    fetchPublicDeals(supabase, {
      column: "score",
      ascending: false,
      foreignTable: "deal_scores",
    }),
    fetchPublicDeals(supabase, {
      column: "monthly_cashflow",
      ascending: false,
      foreignTable: "deal_scores",
    }),
    fetchPublicDeals(supabase, {
      column: "last_refreshed_at",
      ascending: false,
    }),
  ]);

  return { bestRated, mostProfitable, latest };
}

function marketMatchesDeal(
  markets: ProjectConstraints["markets"],
  deal: FeedDeal,
): boolean {
  if (!markets.length) return true;
  return markets.some((m) => {
    if (m.kind === "zip") {
      return deal.zip != null && String(deal.zip) === String(m.zip);
    }
    if (m.kind === "city") {
      const cityOk =
        !deal.city ||
        deal.city.toLowerCase().includes(m.city.toLowerCase()) ||
        m.city.toLowerCase().includes((deal.city ?? "").toLowerCase());
      const stateOk =
        !deal.state ||
        deal.state.toUpperCase() === m.state.toUpperCase();
      return cityOk && stateOk;
    }
    if (m.kind === "county") {
      return (
        !deal.state || deal.state.toUpperCase() === m.state.toUpperCase()
      );
    }
    if (m.kind === "state") {
      return (
        !deal.state || deal.state.toUpperCase() === m.state.toUpperCase()
      );
    }
    return true;
  });
}

export function filterFeedDeals(
  deals: FeedDeal[],
  constraints: ProjectConstraints,
): FeedDeal[] {
  return deals.filter((deal) => {
    if (!marketMatchesDeal(constraints.markets, deal)) return false;

    const price = deal.price != null ? Number(deal.price) : null;
    if (
      constraints.priceMin != null &&
      price != null &&
      price < constraints.priceMin
    ) {
      return false;
    }
    if (
      constraints.priceMax != null &&
      price != null &&
      price > constraints.priceMax
    ) {
      return false;
    }

    const beds = deal.beds != null ? Number(deal.beds) : null;
    if (
      constraints.bedsMin != null &&
      beds != null &&
      beds < constraints.bedsMin
    ) {
      return false;
    }
    if (
      constraints.bedsMax != null &&
      beds != null &&
      beds > constraints.bedsMax
    ) {
      return false;
    }

    const baths = deal.baths != null ? Number(deal.baths) : null;
    if (
      constraints.bathsMin != null &&
      baths != null &&
      baths < constraints.bathsMin
    ) {
      return false;
    }

    const sqft = deal.sqft != null ? Number(deal.sqft) : null;
    if (
      constraints.sqftMin != null &&
      sqft != null &&
      sqft < constraints.sqftMin
    ) {
      return false;
    }

    if (
      constraints.hoaMax != null &&
      deal.hoa_monthly != null &&
      Number(deal.hoa_monthly) > constraints.hoaMax
    ) {
      return false;
    }

    const dscr = deal.score?.dscr != null ? Number(deal.score.dscr) : null;
    if (
      constraints.minDSCR != null &&
      dscr != null &&
      dscr < constraints.minDSCR
    ) {
      return false;
    }

    const cashflow =
      deal.score?.monthly_cashflow != null
        ? Number(deal.score.monthly_cashflow)
        : null;
    if (
      constraints.targetMonthlyCashflow != null &&
      constraints.targetMonthlyCashflow > 0 &&
      cashflow != null &&
      cashflow < constraints.targetMonthlyCashflow * 0.8
    ) {
      return false;
    }

    return true;
  });
}

/** Fetch a larger public pool for AI filter results. */
export async function listPublicFeedDeals(
  supabase: SupabaseClient,
  limit = 120,
): Promise<FeedDeal[]> {
  const { data, error } = await supabase
    .from("deals")
    .select(
      "*, deal_scores(*), projects!inner(id, name, owner_id, is_public)",
    )
    .eq("projects.is_public", true)
    .order("last_refreshed_at", { ascending: false, nullsFirst: false })
    .limit(limit);
  if (error) throw error;

  const mapped = ((data ?? []) as unknown as RawFeedRow[])
    .map(toFeedDeal)
    .filter((d): d is FeedDeal => d !== null);

  return dedupeByListing(mapped, limit);
}

export async function searchFeedDeals(
  supabase: SupabaseClient,
  constraints: ProjectConstraints,
): Promise<FeedDeal[]> {
  const pool = await listPublicFeedDeals(supabase, 200);
  const filtered = filterFeedDeals(pool, constraints);
  // Prefer highest score among matches.
  return filtered
    .sort((a, b) => (b.score?.score ?? 0) - (a.score?.score ?? 0))
    .slice(0, 48);
}
