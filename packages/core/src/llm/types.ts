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
}

export interface DealScoreOutput {
  dealId: string;
  score: number;
  rationale: string;
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
