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
/**
 * Belt-and-suspenders defense against Claude returning percentages where
 * we expect decimal fractions, and against borderline values that would
 * otherwise blow up Zod validation in a way the user can't recover
 * from. We:
 *
 *   1. Divide by 100 when the value is clearly a percentage (`> 1`).
 *   2. Clamp the result back into the Zod-accepted range, so a
 *      `0.96` LTV or a `0.27` rate (just outside the schema) is rounded
 *      to the nearest valid edge instead of surfaced as a 4xx to the
 *      user creating a project.
 *
 * This is purely a guardrail — the system prompt and tool schema are
 * still our primary contract with Claude. But every time we've shipped
 * tightening to the prompt, we've found another out-of-band value in
 * the wild within a few days. Clamping is cheap insurance.
 */
export function normalizeRateUnits(constraints: unknown): unknown {
  if (!constraints || typeof constraints !== "object") return constraints;
  const c = constraints as Record<string, unknown>;
  const m = c.mortgage as Record<string, unknown> | undefined;
  if (m && typeof m === "object") {
    if (typeof m.rateAPR === "number") {
      let r = m.rateAPR;
      if (r > 1) r = r / 100;
      m.rateAPR = clamp(r, 0, 0.25);
    }
    if (typeof m.ltv === "number") {
      let l = m.ltv;
      if (l > 1) l = l / 100;
      m.ltv = clamp(l, 0.05, 0.95);
    }
  }
  if (typeof c.minDSCR === "number") {
    let d = c.minDSCR;
    // DSCR is a multiplier (e.g. 1.25), not a percentage, so we don't
    // divide by 100. But Claude occasionally returns ratios > 3 (e.g.
    // 5.0) when the prompt vibe is "I want safe", which the schema
    // rejects — clamp instead of surfacing an unrecoverable error.
    if (d < 0) d = 0;
    if (d > 3) d = 3;
    c.minDSCR = d;
  }
  // Dollar-amount fields. Claude has a documented tendency to slip
  // between "25" (percent), "0.25" (fraction), and "200000" (the real
  // USD figure) for downPayment / totalCash / priceMax. None of those
  // small values are useful as dollars, and they all pass the schema's
  // `nonnegative` check, so they reach the UI as e.g. "Down payment $25"
  // and silently break the pro-forma. We resolve them here:
  //
  //   - Suspicious downPayment / totalCash (< $1000):
  //       * If it's clearly a fraction (≤ 1) AND we have a price, scale
  //         by price. ("0.25" + priceMax=500k → 125000.)
  //       * If it's clearly a percentage (1 < x ≤ 100) AND we have a
  //         price, scale by price. ("25" + priceMax=500k → 125000.)
  //       * Otherwise drop the field rather than send $25 downstream.
  //   - Suspicious priceMin / priceMax (< 1000) we treat as
  //     thousands-shorthand and multiply by 1000 ("500" → 500000).
  const priceForScale = pickPriceForScale(c);
  c.downPayment = repairDollarAmount(c.downPayment, priceForScale);
  c.totalCash = repairDollarAmount(c.totalCash, priceForScale);
  c.priceMin = repairPriceField(c.priceMin);
  c.priceMax = repairPriceField(c.priceMax);
  return c;
}

function pickPriceForScale(c: Record<string, unknown>): number | undefined {
  const max = typeof c.priceMax === "number" ? c.priceMax : undefined;
  const min = typeof c.priceMin === "number" ? c.priceMin : undefined;
  // If priceMin/priceMax themselves still look like shorthand (< 1000)
  // their repaired form is what we want to scale against. We can't
  // recurse here, so reuse the same multiplication rule inline.
  const upgrade = (p: number | undefined) =>
    p !== undefined && p > 0 && p < 1000 ? p * 1000 : p;
  return upgrade(max) ?? upgrade(min);
}

function repairDollarAmount(
  raw: unknown,
  priceForScale: number | undefined,
): number | undefined {
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw < 0) {
    return raw as number | undefined;
  }
  // Anything ≥ $1k is plausibly real dollars.
  if (raw >= 1000) return raw;
  if (raw === 0) return 0;
  if (priceForScale && priceForScale > 0) {
    if (raw <= 1) return Math.round(raw * priceForScale);
    if (raw <= 100) return Math.round((raw / 100) * priceForScale);
  }
  // No price to anchor against; the value is more misleading than useful.
  return undefined;
}

function repairPriceField(raw: unknown): number | undefined {
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw < 0) {
    return raw as number | undefined;
  }
  // "$500k" written as 500 → 500000. "$1.2M" written as 1.2 → 1200.
  // The lower bound is conservative: a real price under $1000 is
  // implausible in this market.
  if (raw > 0 && raw < 1000) return Math.round(raw * 1000);
  return raw;
}

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  if (n < min) return min;
  if (n > max) return max;
  return n;
}
