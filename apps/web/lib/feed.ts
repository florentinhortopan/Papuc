import {
  ProjectConstraintsSchema,
  type ProjectConstraints,
} from "@papuc/core";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { DealScoresRow, DealsRow } from "./database.types";
import { formatMarket } from "./format";

const SECTION_LIMIT = 12;
const POOL_LIMIT = 160;
const NEW_MS = 48 * 60 * 60 * 1000;

export type FeedChip =
  | "for_you"
  | "new"
  | "searches"
  | "saved"
  | "skipped"
  | "friends"
  | "best"
  | "profitable";

export const FEED_CHIPS: Array<{ id: FeedChip; label: string }> = [
  { id: "for_you", label: "For you" },
  { id: "new", label: "New" },
  { id: "searches", label: "Based on searches" },
  { id: "saved", label: "Saved" },
  { id: "skipped", label: "Skipped" },
  { id: "friends", label: "Friends" },
  { id: "best", label: "Best rated" },
  { id: "profitable", label: "Most profitable" },
];

export type FeedProjectRef = {
  id: string;
  name: string;
  owner_id: string;
};

export type FeedDeal = DealsRow & {
  score: DealScoresRow | null;
  project: FeedProjectRef;
  /** Viewer owns the source project. */
  isOwn?: boolean;
  /** Listing refreshed within NEW_MS. */
  isNew?: boolean;
  /** Soft personalization rank used for For you / searches. */
  tasteRank?: number;
};

export type FeedTasteSummary = {
  projectCount: number;
  marketLabels: string[];
  strategies: string[];
};

export type PersonalizedFeed = {
  forYou: FeedDeal[];
  newForYou: FeedDeal[];
  basedOnSearches: FeedDeal[];
  bestRated: FeedDeal[];
  mostProfitable: FeedDeal[];
  saved: FeedDeal[];
  skipped: FeedDeal[];
  friends: FeedDeal[];
  taste: FeedTasteSummary | null;
};

/** @deprecated Prefer PersonalizedFeed — kept for gradual callers. */
export type FeedSections = {
  bestRated: FeedDeal[];
  mostProfitable: FeedDeal[];
  latest: FeedDeal[];
};

type RawFeedRow = DealsRow & {
  deal_scores: DealScoresRow[] | DealScoresRow | null;
  projects: FeedProjectRef | FeedProjectRef[] | null;
};

type TasteProfile = {
  constraints: ProjectConstraints[];
  marketLabels: string[];
  strategies: string[];
  projectCount: number;
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

function toFeedDeal(row: RawFeedRow, userId?: string): FeedDeal | null {
  const project = pickProject(row);
  if (!project?.id) return null;
  const { deal_scores: _scores, projects: _projects, ...deal } = row;
  const refreshed = Date.parse(deal.last_refreshed_at);
  const isNew =
    Number.isFinite(refreshed) && Date.now() - refreshed < NEW_MS;
  return {
    ...(deal as DealsRow),
    score: pickScore(row),
    project,
    isOwn: userId ? project.owner_id === userId : false,
    isNew,
  };
}

function listingKey(deal: {
  source: string;
  source_property_id: string;
}): string {
  return `${deal.source}:${deal.source_property_id}`;
}

/** Keep highest Papuc score per listing identity. */
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
    const preferNext =
      nextScore > prevScore ||
      (nextScore === prevScore && deal.isOwn && !prev.isOwn);
    if (preferNext) best.set(key, deal);
  }
  return Array.from(best.values()).slice(0, limit);
}

async function fetchDealSlice(
  supabase: SupabaseClient,
  opts: {
    userId: string;
    mode: "own" | "public";
    limit: number;
    order?: { column: string; ascending: boolean; foreignTable?: string };
  },
): Promise<FeedDeal[]> {
  let query = supabase
    .from("deals")
    .select(
      "*, deal_scores(*), projects!inner(id, name, owner_id, is_public)",
    )
    .limit(opts.limit);

  if (opts.mode === "own") {
    query = query.eq("projects.owner_id", opts.userId);
  } else {
    query = query.eq("projects.is_public", true);
  }

  const order = opts.order ?? {
    column: "last_refreshed_at",
    ascending: false,
  };
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

  return ((data ?? []) as unknown as RawFeedRow[])
    .map((row) => toFeedDeal(row, opts.userId))
    .filter((d): d is FeedDeal => d !== null);
}

async function listDismissedListingKeys(
  supabase: SupabaseClient,
  userId: string,
): Promise<Set<string>> {
  const { data, error } = await supabase
    .from("deal_actions")
    .select("deal_id, deals!inner(source, source_property_id)")
    .eq("user_id", userId)
    .eq("action", "dismissed")
    .limit(500);
  if (error) throw error;

  const keys = new Set<string>();
  for (const row of data ?? []) {
    const raw = (row as { deals?: unknown }).deals;
    const deal = Array.isArray(raw) ? raw[0] : raw;
    if (
      deal &&
      typeof deal === "object" &&
      "source" in deal &&
      "source_property_id" in deal
    ) {
      const d = deal as { source: string; source_property_id: string };
      keys.add(listingKey(d));
    }
  }
  return keys;
}

async function loadTasteProfile(
  supabase: SupabaseClient,
  userId: string,
): Promise<TasteProfile> {
  const { data, error } = await supabase
    .from("projects")
    .select("constraints, status")
    .eq("owner_id", userId)
    .in("status", ["active", "draft", "paused"])
    .limit(40);
  if (error) throw error;

  const constraints: ProjectConstraints[] = [];
  const marketLabels: string[] = [];
  const strategies = new Set<string>();

  for (const row of data ?? []) {
    try {
      const c = ProjectConstraintsSchema.parse(row.constraints);
      constraints.push(c);
      strategies.add(c.strategy);
      for (const m of c.markets.slice(0, 2)) {
        const label = formatMarket(m);
        if (label && !marketLabels.includes(label)) marketLabels.push(label);
      }
    } catch {
      /* skip bad rows */
    }
  }

  return {
    constraints,
    marketLabels: marketLabels.slice(0, 6),
    strategies: [...strategies],
    projectCount: constraints.length,
  };
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
        !deal.state || deal.state.toUpperCase() === m.state.toUpperCase();
      return cityOk && stateOk;
    }
    if (m.kind === "county" || m.kind === "state") {
      return !deal.state || deal.state.toUpperCase() === m.state.toUpperCase();
    }
    return true;
  });
}

function softMatchConstraint(
  deal: FeedDeal,
  c: ProjectConstraints,
): { matches: boolean; bonus: number } {
  let bonus = 0;
  let hardFail = false;

  if (c.markets.length && marketMatchesDeal(c.markets, deal)) {
    bonus += 22;
  } else if (c.markets.length) {
    // Soft: still allow but no market bonus
  }

  if (c.strategy === "STR" || c.strategy === "LTR") {
    // Strategy is underwriting context; slight boost when cashflow exists
    if (deal.score?.monthly_cashflow != null) bonus += 4;
  }

  const price = deal.price != null ? Number(deal.price) : null;
  if (c.priceMax != null && price != null) {
    if (price <= c.priceMax) bonus += 12;
    else if (price > c.priceMax * 1.15) hardFail = true;
  }
  if (c.priceMin != null && price != null && price >= c.priceMin) bonus += 4;

  const beds = deal.beds != null ? Number(deal.beds) : null;
  if (c.bedsMin != null && beds != null) {
    if (beds >= c.bedsMin) bonus += 8;
    else hardFail = true;
  }

  const dscr = deal.score?.dscr != null ? Number(deal.score.dscr) : null;
  if (c.minDSCR != null && dscr != null) {
    if (dscr >= c.minDSCR) bonus += 14;
    else if (dscr < c.minDSCR * 0.85) hardFail = true;
  }

  const cashflow =
    deal.score?.monthly_cashflow != null
      ? Number(deal.score.monthly_cashflow)
      : null;
  if (
    c.targetMonthlyCashflow != null &&
    c.targetMonthlyCashflow > 0 &&
    cashflow != null
  ) {
    if (cashflow >= c.targetMonthlyCashflow * 0.8) bonus += 16;
    else if (cashflow < 0 && c.targetMonthlyCashflow > 0) bonus -= 8;
  }

  return { matches: !hardFail && bonus >= 12, bonus };
}

function rankForTaste(deal: FeedDeal, taste: TasteProfile): number {
  const base = deal.score?.score ?? 0;
  let bonus = deal.isOwn ? 6 : 0;
  if (deal.isNew) bonus += 28;

  let bestConstraintBonus = 0;
  let anyMatch = taste.constraints.length === 0;
  for (const c of taste.constraints) {
    const { matches, bonus: b } = softMatchConstraint(deal, c);
    if (matches) anyMatch = true;
    bestConstraintBonus = Math.max(bestConstraintBonus, b);
  }
  bonus += bestConstraintBonus;

  // Cold start: no projects yet — lean on score + recency only.
  if (taste.constraints.length === 0) {
    return base + bonus;
  }

  return (anyMatch ? base : base * 0.35) + bonus;
}

function matchesAnySearch(deal: FeedDeal, taste: TasteProfile): boolean {
  if (!taste.constraints.length) return true;
  return taste.constraints.some((c) => softMatchConstraint(deal, c).matches);
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

async function listFeedPool(
  supabase: SupabaseClient,
  userId: string,
): Promise<FeedDeal[]> {
  const [own, pub, dismissed] = await Promise.all([
    fetchDealSlice(supabase, {
      userId,
      mode: "own",
      limit: POOL_LIMIT,
    }),
    fetchDealSlice(supabase, {
      userId,
      mode: "public",
      limit: POOL_LIMIT,
    }),
    listDismissedListingKeys(supabase, userId),
  ]);

  const merged = dedupeByListing([...own, ...pub], POOL_LIMIT * 2);
  return merged.filter((d) => !dismissed.has(listingKey(d)));
}

async function listActionFeedDeals(
  supabase: SupabaseClient,
  userId: string,
  action: "saved" | "dismissed",
): Promise<FeedDeal[]> {
  const { data, error } = await supabase
    .from("deal_actions")
    .select(
      "deal_id, deals!inner(*, deal_scores(*), projects!inner(id, name, owner_id))",
    )
    .eq("user_id", userId)
    .eq("action", action)
    .order("created_at", { ascending: false })
    .limit(48);
  if (error) throw error;

  const out: FeedDeal[] = [];
  for (const row of data ?? []) {
    const raw = (row as { deals?: unknown }).deals;
    const deal = (Array.isArray(raw) ? raw[0] : raw) as RawFeedRow | undefined;
    if (!deal) continue;
    const mapped = toFeedDeal(deal, userId);
    if (mapped) out.push(mapped);
  }
  return dedupeByListing(out, 48);
}

async function listSavedFeedDeals(
  supabase: SupabaseClient,
  userId: string,
): Promise<FeedDeal[]> {
  return listActionFeedDeals(supabase, userId, "saved");
}

async function listSkippedFeedDeals(
  supabase: SupabaseClient,
  userId: string,
): Promise<FeedDeal[]> {
  return listActionFeedDeals(supabase, userId, "dismissed");
}

/**
 * Personalized Discover payload: own + public inventory, dismissed hidden,
 * ranked with project-constraint taste for For you / New / Searches.
 */
export async function listPersonalizedFeed(
  supabase: SupabaseClient,
  userId: string,
): Promise<PersonalizedFeed> {
  const [pool, taste, saved, skipped] = await Promise.all([
    listFeedPool(supabase, userId),
    loadTasteProfile(supabase, userId),
    listSavedFeedDeals(supabase, userId),
    listSkippedFeedDeals(supabase, userId),
  ]);

  const ranked = pool
    .map((d) => ({
      ...d,
      tasteRank: rankForTaste(d, taste),
    }))
    .sort((a, b) => (b.tasteRank ?? 0) - (a.tasteRank ?? 0));

  const searchMatched = ranked.filter((d) => matchesAnySearch(d, taste));
  const newForYou = ranked.filter((d) => d.isNew).slice(0, SECTION_LIMIT);

  const byScore = [...pool].sort(
    (a, b) => (b.score?.score ?? 0) - (a.score?.score ?? 0),
  );
  const byCashflow = [...pool].sort(
    (a, b) =>
      (b.score?.monthly_cashflow ?? -Infinity) -
      (a.score?.monthly_cashflow ?? -Infinity),
  );

  const tasteSummary: FeedTasteSummary | null =
    taste.projectCount > 0
      ? {
          projectCount: taste.projectCount,
          marketLabels: taste.marketLabels,
          strategies: taste.strategies,
        }
      : null;

  return {
    forYou: ranked.slice(0, SECTION_LIMIT),
    newForYou,
    basedOnSearches: searchMatched.slice(0, SECTION_LIMIT),
    bestRated: byScore.slice(0, SECTION_LIMIT),
    mostProfitable: byCashflow.slice(0, SECTION_LIMIT),
    saved,
    skipped,
    friends: [],
    taste: tasteSummary,
  };
}

/** Legacy sections helper (public-only). Prefer listPersonalizedFeed. */
export async function listFeedSections(
  supabase: SupabaseClient,
): Promise<FeedSections> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { bestRated: [], mostProfitable: [], latest: [] };
  }
  const feed = await listPersonalizedFeed(supabase, user.id);
  return {
    bestRated: feed.bestRated,
    mostProfitable: feed.mostProfitable,
    latest: feed.newForYou.length ? feed.newForYou : feed.forYou,
  };
}

/** Fetch a larger public+own pool for AI filter results. */
export async function listPublicFeedDeals(
  supabase: SupabaseClient,
  limit = 120,
): Promise<FeedDeal[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  const pool = await listFeedPool(supabase, user.id);
  return pool
    .sort(
      (a, b) =>
        Date.parse(b.last_refreshed_at) - Date.parse(a.last_refreshed_at),
    )
    .slice(0, limit);
}

export async function searchFeedDeals(
  supabase: SupabaseClient,
  constraints: ProjectConstraints,
): Promise<FeedDeal[]> {
  const pool = await listPublicFeedDeals(supabase, 200);
  const filtered = filterFeedDeals(pool, constraints);
  return filtered
    .sort((a, b) => (b.score?.score ?? 0) - (a.score?.score ?? 0))
    .slice(0, 48);
}

/** Resolve the deal list for a chip selection. */
export function dealsForChip(
  feed: PersonalizedFeed,
  chip: FeedChip,
): FeedDeal[] {
  switch (chip) {
    case "for_you":
      return feed.forYou;
    case "new":
      return feed.newForYou;
    case "searches":
      return feed.basedOnSearches;
    case "saved":
      return feed.saved;
    case "skipped":
      return feed.skipped;
    case "friends":
      return feed.friends;
    case "best":
      return feed.bestRated;
    case "profitable":
      return feed.mostProfitable;
    default:
      return feed.forYou;
  }
}
