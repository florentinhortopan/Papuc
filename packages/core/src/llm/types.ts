import type { ProjectConstraints } from "../schemas";

export interface DealScoreInput {
  dealId: string;
  address: string;
  price: number;
  beds?: number;
  baths?: number;
  sqft?: number;
  monthlyRent: number;
  pitiaTotal: number;
  dscr: number;
  cashOnCash: number;
  monthlyCashflow: number;
  irr5Yr: number | null;
  /** Days on market at scout time. */
  daysOnMarket?: number;
  /** Most recent price cut as a positive percentage of price (e.g. 4.2). */
  priceCutPct?: number;
  /** ISO timestamp of the most recent price change. */
  priceChangedAt?: string;
  /** Monthly HOA in USD; 0 = confirmed no HOA, undefined = unknown. */
  hoaMonthly?: number;
  /** Lot size in sqft. */
  lotSizeSqft?: number;
  /** STR only: assumed nightly rate underlying the cashflow figures. */
  adr?: number;
  /** STR only: assumed annual occupancy 0..1. */
  occupancy?: number;
  /**
   * STR only: provenance of the ADR assumption —
   * "airroi" (comps-based property estimate), "market_checked"
   * (heuristic clamped to researched market range), or "heuristic"
   * (pure rent-multiplier guess).
   */
  adrSource?: "airroi" | "market_checked" | "heuristic";
  /** STR only: researched typical nightly rate for this market. */
  marketAdrMedian?: number;
}

export interface DealScoreOutput {
  dealId: string;
  score: number;
  rationale: string;
}

export type StrRegulationStatus =
  | "permitted"
  | "restricted"
  | "banned"
  | "unclear";

/**
 * Web-search-backed short-term rental market intelligence for one US
 * market (city + state). Produced by ClaudeProvider.researchStrMarket and
 * cached in the `market_str_intel` table (~60-90 day TTL) — one research
 * call per market, reused by every scout and deal page in that market.
 */
export interface StrMarketIntel {
  /** Plausible ADR range in USD/night for a typical entire home. */
  adrLow?: number;
  adrMedian?: number;
  adrHigh?: number;
  /** Average annual occupancy, decimal fraction 0..1. */
  occupancyAvg?: number;
  seasonalityNotes?: string;
  regulationStatus: StrRegulationStatus;
  regulationSummary?: string;
  permitRequired?: boolean;
  /** Official permit / ordinance / tax pages. */
  resourceLinks: Array<{ title: string; url: string }>;
  /** URLs backing the ADR/occupancy figures. */
  sources: string[];
}

export interface LLMProvider {
  parseProjectGoals(prompt: string): Promise<ProjectConstraints>;
  rankDeals(args: {
    userPrompt: string;
    constraints: ProjectConstraints;
    deals: DealScoreInput[];
  }): Promise<DealScoreOutput[]>;
}

export interface LLMUsage {
  inputTokens: number;
  outputTokens: number;
  model: string;
}
