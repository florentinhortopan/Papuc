import Anthropic from "@anthropic-ai/sdk";
import { ProjectConstraintsSchema, type ProjectConstraints } from "../schemas";
import {
  ADVISE_FINANCING_FIT_SYSTEM,
  ADVISE_FINANCING_FIT_TOOL,
  ANALYZE_PROPERTY_CONDITION_SYSTEM,
  PARSE_PROJECT_SYSTEM,
  PARSE_PROJECT_TOOL,
  RANK_DEALS_SYSTEM,
  RANK_DEALS_TOOL,
  RECORD_PROPERTY_CONDITION_TOOL,
  RECORD_STR_MARKET_INTEL_TOOL,
  RESEARCH_STR_MARKET_SYSTEM,
} from "./prompts";
import {
  downscaleListingPhotoUrl,
  normalizePropertyConditionAssessment,
  type AnalyzePropertyConditionArgs,
  type PropertyConditionAssessment,
} from "./property-condition";
import type {
  DealScoreInput,
  DealScoreOutput,
  LLMProvider,
  StrMarketIntel,
} from "./types";

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

  /**
   * Research a US market's STR reality (plausible ADR range + occupancy)
   * and its short-term-rental regulations, using the Anthropic server-side
   * web-search tool (max 5 searches ≈ $0.05 + tokens). Returns structured
   * intel; callers cache it (market_str_intel table) so this runs about
   * once per market per TTL, not per scout.
   *
   * tool_choice cannot be forced here — the model must be free to call
   * web_search first — so we instruct it to finish with the
   * recordStrMarketIntel tool and fail loudly if it doesn't.
   */
  async researchStrMarket(args: {
    city: string;
    state: string;
  }): Promise<StrMarketIntel> {
    const res = await this.client.messages.create({
      model: this.model,
      // Research responses carry search-result blocks + a final tool call;
      // give it more room than the parse/rank calls need.
      max_tokens: Math.max(this.maxTokens, 4096),
      system: RESEARCH_STR_MARKET_SYSTEM,
      tools: [
        {
          type: "web_search_20250305",
          name: "web_search",
          max_uses: 5,
        } as any,
        RECORD_STR_MARKET_INTEL_TOOL as any,
      ],
      messages: [
        {
          role: "user",
          content: `Market to research: ${args.city}, ${args.state} (United States).`,
        },
      ],
    });

    for (const block of res.content) {
      if (
        block.type === "tool_use" &&
        block.name === RECORD_STR_MARKET_INTEL_TOOL.name
      ) {
        return normalizeStrMarketIntel(block.input);
      }
    }
    throw new Error("Claude did not return recordStrMarketIntel tool call");
  }

  /**
   * Analyze listing photo URLs for visible condition issues and rough
   * rehab / maintenance dollar suggestions. Opt-in caller only — vision
   * tokens scale with photo count. Prefer public URL image blocks; on
   * Anthropic fetch failure, retry once with server-side base64.
   */
  async analyzePropertyCondition(
    args: AnalyzePropertyConditionArgs,
  ): Promise<PropertyConditionAssessment> {
    // Caller supplies a batch (already capped). Only normalize/downscale here.
    const photoUrls = args.photoUrls
      .map((u) => downscaleListingPhotoUrl(String(u).trim()))
      .filter((u) => /^https?:\/\//i.test(u));
    if (photoUrls.length === 0) {
      throw new Error("no usable photo URLs to analyze");
    }

    try {
      return await this.runPropertyCondition(photoUrls, args, "url");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Anthropic returns 400s when it cannot fetch remote images (CDN
      // blocks, expired signed URLs, etc.). Fall back to base64 once.
      if (!/image|url|fetch|download|media/i.test(msg)) throw err;
      return await this.runPropertyCondition(photoUrls, args, "base64");
    }
  }

  private async runPropertyCondition(
    photoUrls: string[],
    args: AnalyzePropertyConditionArgs,
    mode: "url" | "base64",
  ): Promise<PropertyConditionAssessment> {
    const imageBlocks: Anthropic.ImageBlockParam[] = [];
    if (mode === "url") {
      for (const url of photoUrls) {
        imageBlocks.push({
          type: "image",
          source: { type: "url", url },
        });
      }
    } else {
      for (const url of photoUrls) {
        const fetched = await fetchImageAsBase64(url);
        if (!fetched) continue;
        imageBlocks.push({
          type: "image",
          source: {
            type: "base64",
            media_type: fetched.mediaType,
            data: fetched.data,
          },
        });
      }
      if (imageBlocks.length === 0) {
        throw new Error("could not download any listing photos for analysis");
      }
    }

    const batch = args.batch;
    const contextLines = [
      "Analyze the listing photos above for property condition, red flags, and rehab/maintenance cost implications.",
      batch
        ? `This is batch ${batch.batchIndex + 1} of ${batch.batchCount} (gallery photos ${batch.globalStartIndex}–${batch.globalStartIndex + imageBlocks.length - 1} of ${batch.totalPhotos}). photoIndexes in findings are 0-based within THIS batch only.`
        : `Photo count: ${imageBlocks.length} (indexes 0..${imageBlocks.length - 1}).`,
      args.address ? `Address: ${args.address}` : null,
      args.beds != null ? `Beds: ${args.beds}` : null,
      args.baths != null ? `Baths: ${args.baths}` : null,
      args.sqft != null ? `Sqft: ${args.sqft}` : null,
      args.yearBuilt != null ? `Year built: ${args.yearBuilt}` : null,
      args.price != null ? `List/est. price: $${Math.round(args.price)}` : null,
      "Report only issues visible in these photos. Call recordPropertyCondition with your assessment.",
    ].filter(Boolean);

    const content: Anthropic.ContentBlockParam[] = [
      ...imageBlocks,
      { type: "text", text: contextLines.join("\n") },
    ];

    const res = await this.client.messages.create({
      model: this.model,
      max_tokens: Math.max(this.maxTokens, 4096),
      system: ANALYZE_PROPERTY_CONDITION_SYSTEM,
      tools: [RECORD_PROPERTY_CONDITION_TOOL as any],
      tool_choice: {
        type: "tool",
        name: RECORD_PROPERTY_CONDITION_TOOL.name,
      } as any,
      messages: [{ role: "user", content }],
    });

    for (const block of res.content) {
      if (
        block.type === "tool_use" &&
        block.name === RECORD_PROPERTY_CONDITION_TOOL.name
      ) {
        return normalizePropertyConditionAssessment(block.input);
      }
    }
    throw new Error("Claude did not return recordPropertyCondition tool call");
  }

  /**
   * Advice layer on top of a deterministic lender shortlist. Does not invent
   * lenders or rates — explains path fit and next steps for buying.
   */
  async adviseFinancingFit(args: {
    profile: Record<string, unknown>;
    matches: Array<Record<string, unknown>>;
    flags: Record<string, unknown>;
  }): Promise<FinancingFitAdvice> {
    const userMessage = [
      `Deal scenario profile:`,
      JSON.stringify(args.profile, null, 2),
      ``,
      `Matched lenders (already filtered — do not add others):`,
      JSON.stringify(args.matches, null, 2),
      ``,
      `Flags: ${JSON.stringify(args.flags)}`,
    ].join("\n");

    const res = await this.client.messages.create({
      model: this.model,
      max_tokens: Math.max(this.maxTokens, 2048),
      system: ADVISE_FINANCING_FIT_SYSTEM,
      tools: [ADVISE_FINANCING_FIT_TOOL as any],
      tool_choice: {
        type: "tool",
        name: ADVISE_FINANCING_FIT_TOOL.name,
      } as any,
      messages: [{ role: "user", content: userMessage }],
    });

    for (const block of res.content) {
      if (
        block.type === "tool_use" &&
        block.name === ADVISE_FINANCING_FIT_TOOL.name
      ) {
        return normalizeFinancingFitAdvice(block.input);
      }
    }
    throw new Error("Claude did not return adviseFinancingFit tool call");
  }

  /** Model id used for calls (exposed so callers can cache provenance). */
  get modelId(): string {
    return this.model;
  }
}

const IMAGE_MEDIA_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
]);

async function fetchImageAsBase64(
  url: string,
): Promise<{ mediaType: "image/jpeg" | "image/png" | "image/gif" | "image/webp"; data: string } | null> {
  try {
    const res = await fetch(url, {
      headers: { Accept: "image/*,*/*" },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    const contentType = (res.headers.get("content-type") ?? "")
      .split(";")[0]!
      .trim()
      .toLowerCase();
    let mediaType = contentType;
    if (!IMAGE_MEDIA_TYPES.has(mediaType)) {
      // Zillow CDNs often omit or mis-label; sniff from URL extension.
      if (/\.png(\?|$)/i.test(url)) mediaType = "image/png";
      else if (/\.webp(\?|$)/i.test(url)) mediaType = "image/webp";
      else if (/\.gif(\?|$)/i.test(url)) mediaType = "image/gif";
      else mediaType = "image/jpeg";
    }
    if (!IMAGE_MEDIA_TYPES.has(mediaType)) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    // Skip tiny/error payloads and very large frames.
    if (buf.length < 500 || buf.length > 5_000_000) return null;
    return {
      mediaType: mediaType as
        | "image/jpeg"
        | "image/png"
        | "image/gif"
        | "image/webp",
      data: buf.toString("base64"),
    };
  } catch {
    return null;
  }
}

/**
 * Defensive normalization of the research tool output: percentage-form
 * occupancy, non-finite/negative ADRs, an inverted low/high range,
 * non-http links, and unknown regulation statuses are all repaired or
 * dropped so downstream consumers (schedule blending, the regs card)
 * never see junk.
 */
export function normalizeStrMarketIntel(raw: unknown): StrMarketIntel {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, any>;

  const adr = (v: unknown): number | undefined => {
    if (typeof v !== "number" || !Number.isFinite(v) || v <= 0) return undefined;
    // US entire-home ADRs live in roughly $50-$2000/night; outside that
    // the "data" is more misleading than useful.
    if (v < 20 || v > 5000) return undefined;
    return Math.round(v);
  };

  let adrLow = adr(r.adrLow);
  let adrMedian = adr(r.adrMedian);
  let adrHigh = adr(r.adrHigh);
  if (adrLow !== undefined && adrHigh !== undefined && adrLow > adrHigh) {
    [adrLow, adrHigh] = [adrHigh, adrLow];
  }
  if (adrMedian !== undefined) {
    if (adrLow !== undefined && adrMedian < adrLow) adrMedian = adrLow;
    if (adrHigh !== undefined && adrMedian > adrHigh) adrMedian = adrHigh;
  }

  let occupancyAvg: number | undefined;
  if (typeof r.occupancyAvg === "number" && Number.isFinite(r.occupancyAvg)) {
    let o = r.occupancyAvg;
    if (o > 1) o = o / 100; // percentage form despite the schema
    if (o > 0 && o <= 1) occupancyAvg = Math.min(0.95, Math.max(0.1, o));
  }

  const statuses = ["permitted", "restricted", "banned", "unclear"] as const;
  const regulationStatus = statuses.includes(r.regulationStatus)
    ? (r.regulationStatus as StrMarketIntel["regulationStatus"])
    : "unclear";

  const resourceLinks = Array.isArray(r.resourceLinks)
    ? r.resourceLinks
        .filter(
          (l: any) =>
            l &&
            typeof l.url === "string" &&
            /^https?:\/\//i.test(l.url) &&
            typeof l.title === "string",
        )
        .map((l: any) => ({ title: String(l.title), url: String(l.url) }))
        .slice(0, 8)
    : [];

  const sources = Array.isArray(r.sources)
    ? r.sources
        .filter((s: any) => typeof s === "string" && /^https?:\/\//i.test(s))
        .slice(0, 8)
    : [];

  return {
    adrLow,
    adrMedian,
    adrHigh,
    occupancyAvg,
    seasonalityNotes:
      typeof r.seasonalityNotes === "string" ? r.seasonalityNotes : undefined,
    regulationStatus,
    regulationSummary:
      typeof r.regulationSummary === "string" ? r.regulationSummary : undefined,
    permitRequired:
      typeof r.permitRequired === "boolean" ? r.permitRequired : undefined,
    resourceLinks,
    sources,
  };
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

export interface FinancingFitAdvice {
  headline: string;
  pathSummary: string;
  lenderNotes: Array<{ lenderId: string; note: string }>;
  nextSteps: string[];
  disclaimer: string;
}

function normalizeFinancingFitAdvice(raw: unknown): FinancingFitAdvice {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<
    string,
    unknown
  >;
  const lenderNotesRaw = Array.isArray(o.lenderNotes) ? o.lenderNotes : [];
  const nextStepsRaw = Array.isArray(o.nextSteps) ? o.nextSteps : [];
  return {
    headline:
      typeof o.headline === "string" && o.headline.trim()
        ? o.headline.trim()
        : "Financing fit",
    pathSummary:
      typeof o.pathSummary === "string" && o.pathSummary.trim()
        ? o.pathSummary.trim()
        : "Review the matched lenders and confirm terms directly.",
    lenderNotes: lenderNotesRaw
      .map((row) => {
        if (!row || typeof row !== "object") return null;
        const r = row as Record<string, unknown>;
        const lenderId =
          typeof r.lenderId === "string" ? r.lenderId.trim() : "";
        const note = typeof r.note === "string" ? r.note.trim() : "";
        if (!lenderId || !note) return null;
        return { lenderId, note };
      })
      .filter((x): x is { lenderId: string; note: string } => x !== null),
    nextSteps: nextStepsRaw
      .map((s) => (typeof s === "string" ? s.trim() : ""))
      .filter(Boolean)
      .slice(0, 8),
    disclaimer:
      typeof o.disclaimer === "string" && o.disclaimer.trim()
        ? o.disclaimer.trim()
        : "Educational matching only — not a loan offer, commitment, or personalized investment advice. Confirm eligibility and pricing with each lender.",
  };
}
