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
