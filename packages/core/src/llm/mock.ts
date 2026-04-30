import { ProjectConstraintsSchema, type ProjectConstraints } from "../schemas";
import type { DealScoreInput, DealScoreOutput, LLMProvider } from "./types";

/**
 * A simple deterministic LLMProvider that doesn't call any network APIs.
 * Useful for offline dev, unit tests, and as a fallback when no Anthropic key is set.
 */
export class MockLLMProvider implements LLMProvider {
  async parseProjectGoals(prompt: string): Promise<ProjectConstraints> {
    const lower = prompt.toLowerCase();
    const strategy = /airbnb|short.?term|str|vacation/.test(lower) ? "STR" : "LTR";

    const priceMaxMatch = lower.match(/(?:under|below|max(?:imum)?)\s*\$?(\d[\d,.]*)\s*(k|m)?/);
    const priceMax = priceMaxMatch
      ? parseDollar(priceMaxMatch[1]!, priceMaxMatch[2])
      : undefined;

    const downMatch = lower.match(/\$?(\d[\d,.]*)\s*(k|m)?\s*(?:down|down\s*payment)/);
    const downPayment = downMatch
      ? parseDollar(downMatch[1]!, downMatch[2])
      : undefined;

    const cashflowMatch = lower.match(/\$?(\d[\d,.]*)\s*(?:\/|\s*per\s*)?(?:mo|month|monthly)/);
    const targetMonthlyCashflow = cashflowMatch
      ? parseDollar(cashflowMatch[1]!, undefined)
      : undefined;

    const market = parseMarket(prompt) ?? { kind: "city" as const, city: "Austin", state: "TX" };

    const constraints: ProjectConstraints = ProjectConstraintsSchema.parse({
      markets: [market],
      priceMax,
      downPayment,
      targetMonthlyCashflow,
      propertyTypes: ["single_family"],
      minDSCR: 1.0,
      strategy,
      mortgage: {
        rateAPR: 0.075,
        termYears: 30,
        ltv: downPayment && priceMax ? Math.max(0.55, 1 - downPayment / priceMax) : 0.75,
        interestOnly: false,
      },
      notes: prompt,
    });
    return constraints;
  }

  async rankDeals(args: {
    userPrompt: string;
    constraints: ProjectConstraints;
    deals: DealScoreInput[];
  }): Promise<DealScoreOutput[]> {
    const target = args.constraints.targetMonthlyCashflow ?? 0;
    return args.deals.map((d) => {
      let score = 50;
      if (d.dscr >= 1.25) score += 25;
      else if (d.dscr >= 1.0) score += 10;
      else score -= 20;

      if (target > 0) {
        if (d.monthlyCashflow >= target) score += 20;
        else if (d.monthlyCashflow >= target * 0.75) score += 5;
        else score -= 10;
      }

      score = Math.max(0, Math.min(100, score));
      const cashStr = `$${Math.round(d.monthlyCashflow)}/mo`;
      const dscrStr = d.dscr.toFixed(2);
      const rationale =
        d.dscr >= 1.0
          ? `${cashStr} cash flow at ${dscrStr} DSCR — covers debt service.`
          : `${cashStr} cash flow at ${dscrStr} DSCR — below 1.0 means negative coverage; only proceed with reserves.`;
      return { dealId: d.dealId, score, rationale };
    });
  }
}

function parseDollar(num: string, suffix: string | undefined): number {
  const n = Number(num.replace(/,/g, ""));
  if (suffix === "k") return n * 1_000;
  if (suffix === "m") return n * 1_000_000;
  return n;
}

const STATE_ABBR = new Set([
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY","DC",
]);

function parseMarket(prompt: string): { kind: "city"; city: string; state: string } | null {
  const m = prompt.match(/in\s+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)*)(?:,?\s+([A-Z]{2}))?/);
  if (!m) return null;
  const city = m[1]!.trim();
  const state = m[2] && STATE_ABBR.has(m[2]) ? m[2] : "CA";
  return { kind: "city", city, state };
}
