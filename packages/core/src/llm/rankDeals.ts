import type { ProjectConstraints } from "../schemas";
import type { DealScoreInput, DealScoreOutput, LLMProvider } from "./types";

export async function rankDeals(
  llm: LLMProvider,
  args: {
    userPrompt: string;
    constraints: ProjectConstraints;
    deals: DealScoreInput[];
  },
): Promise<DealScoreOutput[]> {
  return llm.rankDeals(args);
}
