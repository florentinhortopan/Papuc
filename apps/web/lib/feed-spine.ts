/**
 * Discover spine: the viewer's own project deals.
 * Sacred path — no follows, watches, is_public, or public_profiles.
 */
import {
  ProjectConstraintsSchema,
  expandMarketsForScout,
  type ProjectConstraints,
} from "@papuc/core";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { DealScoresRow, DealsRow } from "./database.types";
import { formatMarket } from "./format";

export const SECTION_LIMIT = 12;
export const POOL_LIMIT = 160;
export const NEW_MS = 48 * 60 * 60 * 1000;

export type FeedProjectRef = {
  id: string;
  name: string;
  owner_id: string;
};

export type FeedDeal = DealsRow & {
  score: DealScoresRow | null;
  project: FeedProjectRef;
  isOwn?: boolean;
  isNew?: boolean;
  tasteRank?: number;
  ownerDisplayName?: string | null;
  /** Viewer currently follows this deal's project owner (public cards). */
  isFollowingOwner?: boolean;
};

export type FeedTasteSummary = {
  projectCount: number;
  marketLabels: string[];
  strategies: string[];
};

export type TasteProfile = {
  constraints: ProjectConstraints[];
  marketLabels: string[];
  strategies: string[];
  projectCount: number;
};

export type RawFeedRow = DealsRow & {
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

export function toFeedDeal(
  row: RawFeedRow,
  userId?: string,
): FeedDeal | null {
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

export function listingKey(deal: {
  source: string;
  source_property_id: string;
}): string {
  return `${deal.source}:${deal.source_property_id}`;
}

/** Keep highest Papuc score per listing identity. */
export function dedupeByListing(
  deals: FeedDeal[],
  limit: number,
): FeedDeal[] {
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

/**
 * Load deals by project_id list. Never filter via nested projects.* columns.
 */
export async function fetchDealsForProjectIds(
  supabase: SupabaseClient,
  opts: { userId: string; projectIds: string[]; limit: number },
): Promise<FeedDeal[]> {
  if (opts.projectIds.length === 0) return [];

  const chunkSize = 80;
  const chunks: string[][] = [];
  for (let i = 0; i < opts.projectIds.length; i += chunkSize) {
    chunks.push(opts.projectIds.slice(i, i + chunkSize));
  }

  const rows: RawFeedRow[] = [];
  for (const ids of chunks) {
    const { data, error } = await supabase
      .from("deals")
      .select(
        // Disambiguate: projects.source_deal_id also FKs to deals (PGRST201).
        "*, deal_scores(*), projects!project_id!inner(id, name, owner_id)",
      )
      .in("project_id", ids)
      .eq("inventory_status", "live")
      .order("last_refreshed_at", { ascending: false })
      .limit(opts.limit);
    if (error) throw error;
    rows.push(...((data ?? []) as unknown as RawFeedRow[]));
    if (rows.length >= opts.limit) break;
  }

  return rows
    .slice(0, opts.limit)
    .map((row) => toFeedDeal(row, opts.userId))
    .filter((d): d is FeedDeal => d !== null);
}

export async function listOwnProjectIds(
  supabase: SupabaseClient,
  userId: string,
): Promise<string[]> {
  const { data, error } = await supabase
    .from("projects")
    .select("id")
    .eq("owner_id", userId)
    .limit(200);
  if (error) throw error;
  return (data ?? []).map((row) => row.id as string);
}

export async function listDismissedListingKeys(
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

/** Own project deals only — the Discover spine. */
export async function listOwnFeedPool(
  supabase: SupabaseClient,
  userId: string,
): Promise<FeedDeal[]> {
  const projectIds = await listOwnProjectIds(supabase, userId);
  // Dismissals are best-effort — never blank the spine if this join fails.
  const dismissed = await listDismissedListingKeys(supabase, userId).catch(
    () => new Set<string>(),
  );
  const deals = await fetchDealsForProjectIds(supabase, {
    userId,
    projectIds,
    limit: POOL_LIMIT,
  });
  return dedupeByListing(
    deals.filter((d) => !dismissed.has(listingKey(d))),
    POOL_LIMIT,
  );
}

export async function loadTasteProfile(
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
  const expanded = expandMarketsForScout(markets);
  return expanded.some((m) => {
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
    if (m.kind === "near") {
      const place = m.place.toLowerCase();
      const cityHit =
        deal.city != null && deal.city.toLowerCase().includes(place);
      const stateOk =
        !m.state ||
        !deal.state ||
        deal.state.toUpperCase() === m.state.toUpperCase();
      return cityHit && stateOk;
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
  }

  if (c.strategy === "STR" || c.strategy === "LTR") {
    if (deal.score?.monthly_cashflow != null) bonus += 4;
  }

  const intent = c.intent;
  if (intent?.placeTags?.length) {
    const hay = `${deal.city ?? ""} ${deal.address ?? ""}`.toLowerCase();
    if (intent.placeTags.some((t) => hay.includes(t.toLowerCase()))) {
      bonus += 6;
    }
  }
  if (
    (intent?.useCase === "land_hold" || intent?.useCase === "land_develop") &&
    deal.lot_size != null &&
    Number(deal.lot_size) > 0 &&
    (deal.beds == null || Number(deal.beds) === 0)
  ) {
    bonus += 10;
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

export function rankForTaste(deal: FeedDeal, taste: TasteProfile): number {
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

  if (taste.constraints.length === 0) {
    return base + bonus;
  }

  return (anyMatch ? base : base * 0.35) + bonus;
}

export function matchesAnySearch(
  deal: FeedDeal,
  taste: TasteProfile,
): boolean {
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

async function listActionFeedDeals(
  supabase: SupabaseClient,
  userId: string,
  action: "saved" | "dismissed",
): Promise<FeedDeal[]> {
  const { data, error } = await supabase
    .from("deal_actions")
    .select(
      "deal_id, deals!inner(*, deal_scores(*), projects!project_id!inner(id, name, owner_id))",
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

export async function listSavedFeedDeals(
  supabase: SupabaseClient,
  userId: string,
): Promise<FeedDeal[]> {
  return listActionFeedDeals(supabase, userId, "saved");
}

export async function listSkippedFeedDeals(
  supabase: SupabaseClient,
  userId: string,
): Promise<FeedDeal[]> {
  return listActionFeedDeals(supabase, userId, "dismissed");
}

export type SpineSections = {
  pool: FeedDeal[];
  forYou: FeedDeal[];
  newForYou: FeedDeal[];
  basedOnSearches: FeedDeal[];
  bestRated: FeedDeal[];
  mostProfitable: FeedDeal[];
  saved: FeedDeal[];
  skipped: FeedDeal[];
  taste: FeedTasteSummary | null;
};

/** Build ranked Discover chips from the viewer's own deals (+ saved/skipped). */
export async function buildSpineSections(
  supabase: SupabaseClient,
  userId: string,
): Promise<SpineSections> {
  const [pool, taste, saved, skipped] = await Promise.all([
    listOwnFeedPool(supabase, userId),
    loadTasteProfile(supabase, userId).catch(
      (): TasteProfile => ({
        constraints: [],
        marketLabels: [],
        strategies: [],
        projectCount: 0,
      }),
    ),
    listSavedFeedDeals(supabase, userId).catch(() => [] as FeedDeal[]),
    listSkippedFeedDeals(supabase, userId).catch(() => [] as FeedDeal[]),
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
    pool,
    forYou: ranked.slice(0, SECTION_LIMIT),
    newForYou,
    basedOnSearches: searchMatched.slice(0, SECTION_LIMIT),
    bestRated: byScore.slice(0, SECTION_LIMIT),
    mostProfitable: byCashflow.slice(0, SECTION_LIMIT),
    saved,
    skipped,
    taste: tasteSummary,
  };
}
