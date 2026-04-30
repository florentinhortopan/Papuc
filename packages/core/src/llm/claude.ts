import Anthropic from "@anthropic-ai/sdk";
import { ProjectConstraintsSchema, type ProjectConstraints } from "../schemas";
import {
  PARSE_PROJECT_SYSTEM,
  PARSE_PROJECT_TOOL,
  RANK_DEALS_SYSTEM,
  RANK_DEALS_TOOL,
} from "./prompts";
import type { DealScoreInput, DealScoreOutput, LLMProvider } from "./types";

export interface ClaudeProviderOptions {
  apiKey: string;
  model?: string;
  maxTokens?: number;
  baseURL?: string;
}

export class ClaudeProvider implements LLMProvider {
  private client: Anthropic;
  private model: string;
  private maxTokens: number;

  constructor(opts: ClaudeProviderOptions) {
    this.client = new Anthropic({
      apiKey: opts.apiKey,
      baseURL: opts.baseURL,
    });
    this.model = opts.model ?? "claude-sonnet-4-6";
    this.maxTokens = opts.maxTokens ?? 2048;
  }

  async parseProjectGoals(prompt: string): Promise<ProjectConstraints> {
    const res = await this.client.messages.create({
      model: this.model,
      max_tokens: this.maxTokens,
      system: PARSE_PROJECT_SYSTEM,
      tools: [PARSE_PROJECT_TOOL as any],
      tool_choice: { type: "tool", name: PARSE_PROJECT_TOOL.name } as any,
      messages: [{ role: "user", content: prompt }],
    });

    for (const block of res.content) {
      if (block.type === "tool_use" && block.name === PARSE_PROJECT_TOOL.name) {
        const input = block.input as { constraints: unknown };
        const normalized = normalizeRateUnits(input.constraints);
        return ProjectConstraintsSchema.parse(normalized);
      }
    }
    throw new Error("Claude did not return parseProjectGoals tool call");
  }

  async rankDeals(args: {
    userPrompt: string;
    constraints: ProjectConstraints;
    deals: DealScoreInput[];
  }): Promise<DealScoreOutput[]> {
    const userMessage = [
      `Original user prompt: ${args.userPrompt}`,
      ``,
      `Constraints: ${JSON.stringify(args.constraints)}`,
      ``,
      `Scouted deals (numbers already computed):`,
      JSON.stringify(args.deals, null, 2),
    ].join("\n");

    const res = await this.client.messages.create({
      model: this.model,
      max_tokens: this.maxTokens,
      system: RANK_DEALS_SYSTEM,
      tools: [RANK_DEALS_TOOL as any],
      tool_choice: { type: "tool", name: RANK_DEALS_TOOL.name } as any,
      messages: [{ role: "user", content: userMessage }],
    });

    for (const block of res.content) {
      if (block.type === "tool_use" && block.name === RANK_DEALS_TOOL.name) {
        const input = block.input as { rankings: DealScoreOutput[] };
        return input.rankings;
      }
    }
    throw new Error("Claude did not return rankDeals tool call");
  }
}

/**
 * Defensive coercion: LLMs occasionally return percentage-form numbers
 * (e.g. 7.5 instead of 0.075 for APR) despite explicit decimal instructions.
 * If a rate/ratio looks percent-form (>1), divide by 100 so Zod parsing succeeds.
 */
function normalizeRateUnits(constraints: unknown): unknown {
  if (!constraints || typeof constraints !== "object") return constraints;
  const c = constraints as Record<string, unknown>;
  const m = c.mortgage as Record<string, unknown> | undefined;
  if (m && typeof m === "object") {
    if (typeof m.rateAPR === "number" && m.rateAPR > 1) {
      m.rateAPR = m.rateAPR / 100;
    }
    if (typeof m.ltv === "number" && m.ltv > 1) {
      m.ltv = m.ltv / 100;
    }
  }
  return c;
}
