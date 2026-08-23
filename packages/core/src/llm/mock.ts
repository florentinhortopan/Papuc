import {
  extractAddressFromListingUrl,
  type ListingAddressHint,
  type ListingUrlPlatform,
} from "../listing-url";
import {
  ProjectConstraintsSchema,
  type ProjectConstraints,
  type ProjectIntent,
  type ProjectUseCase,
  type PropertyType,
} from "../schemas";
import { lookupRegionAlias } from "../region-aliases";
import {
  CONDITION_DISCLAIMER,
  type AnalyzePropertyConditionArgs,
  type PropertyConditionAssessment,
} from "./property-condition";
import type { DealScoreInput, DealScoreOutput, LLMProvider } from "./types";

/**
 * A simple deterministic LLMProvider that doesn't call any network APIs.
 * Useful for offline dev, unit tests, and as a fallback when no Anthropic key is set.
 */
export class MockLLMProvider implements LLMProvider {
  async parseProjectGoals(prompt: string): Promise<ProjectConstraints> {
    const lower = prompt.toLowerCase();

    const priceMaxMatch = lower.match(
      /(?:under|below|max(?:imum)?)\s*\$?(\d[\d,.]*)\s*(k|m)?/,
    );
    const priceMax = priceMaxMatch
      ? parseDollar(priceMaxMatch[1]!, priceMaxMatch[2])
      : undefined;

    const downMatch = lower.match(
      /\$?(\d[\d,.]*)\s*(k|m)?\s*(?:down|down\s*payment)/,
    );
    const downPayment = downMatch
      ? parseDollar(downMatch[1]!, downMatch[2])
      : undefined;

    const cashMatch = lower.match(
      /\$?(\d[\d,.]*)\s*(k|m)?\s*(?:in\s+)?(?:cash|savings)/,
    );
    const totalCash = cashMatch
      ? parseDollar(cashMatch[1]!, cashMatch[2])
      : undefined;

    const cashflowMatch = lower.match(
      /\$?(\d[\d,.]*)\s*(?:\/|\s*per\s*)?(?:mo|month|monthly)/,
    );
    const targetMonthlyCashflow = cashflowMatch
      ? parseDollar(cashflowMatch[1]!, undefined)
      : undefined;

    const familyMatch = lower.match(
      /family\s+of\s+(\d+)|(\d+)\s*(?:person|people|bedrooms?\s+for)/,
    );
    const householdTotal = familyMatch
      ? Number(familyMatch[1] ?? familyMatch[2])
      : undefined;

    const horizonMatch = lower.match(
      /(?:in|for|after|within)\s+(\d+)\s*(?:-|–)?\s*(?:to\s+\d+\s+)?years?|(?:a\s+few|few)\s+years/,
    );
    let horizonYears: number | undefined;
    if (horizonMatch?.[1]) horizonYears = Number(horizonMatch[1]);
    else if (/few\s+years|couple\s+of\s+years/.test(lower)) horizonYears = 3;

    const liveThenStr =
      /live.{0,40}(?:then|later).{0,20}(?:airbnb|short.?term|str)|(?:airbnb|short.?term).{0,30}(?:later|after)/i.test(
        prompt,
      ) || /owner.?occup/.test(lower);

    const isLand = /\bland\b|\blot\b|vacant\s+land|raw\s+land/.test(lower);
    const isDevelop = /develop|build\s+(?:on|later)|entitl/.test(lower);
    const isLiveWork =
      /live.?work|live\s+(?:upstairs|above)|cafe|storefront|mixed.?use/.test(
        lower,
      );
    const isCommercial = /commercial|office|retail|warehouse/.test(lower);
    const wantsStrNow =
      !liveThenStr && /airbnb|short.?term|\bstr\b|vacation\s+rental/.test(lower);

    let useCase: ProjectUseCase = "rental_income";
    let propertyTypes: PropertyType[] = ["single_family"];
    let strategy: "LTR" | "STR" = "LTR";
    const warnings: string[] = [];
    const placeTags: string[] = [];

    if (/\bmountain\b|\bretreat\b/.test(lower)) placeTags.push("mountain");
    if (/\bcoastal\b|\bbeach\b|\bsurf\b/.test(lower)) placeTags.push("coastal");
    if (/\burban\b|\bcity\b/.test(lower)) placeTags.push("urban");
    if (/\beast\s*bay\b/.test(lower)) placeTags.push("east_bay");

    if (isLand) {
      propertyTypes = ["land"];
      useCase = isDevelop ? "land_develop" : "land_hold";
      warnings.push("Land has no rental DSCR; underwrite carrying cost and lot value.");
    } else if (isLiveWork) {
      propertyTypes = ["mixed_use"];
      useCase = "live_work";
      warnings.push(
        "Mixed-use / commercial listings need RealEstateAPI; Zillow path will skip them.",
      );
    } else if (isCommercial) {
      propertyTypes = ["commercial"];
      useCase = "commercial_ops";
      warnings.push(
        "Commercial listings need RealEstateAPI; Zillow path will skip them.",
      );
    } else if (liveThenStr) {
      useCase = "owner_occupy_then_str";
      strategy = "LTR";
    } else if (wantsStrNow) {
      useCase = "hospitality_str";
      strategy = "STR";
    } else if (
      placeTags.length > 0 ||
      /second\s+home|weekend|retreat|lifestyle/.test(lower)
    ) {
      useCase = "lifestyle_second_home";
    } else if (/primary|live\s+in|move\s+in/.test(lower)) {
      useCase = "primary_residence";
    }

    const markets = parseMarkets(prompt);
    const bedsMin =
      householdTotal && householdTotal >= 4
        ? 3
        : householdTotal && householdTotal >= 3
          ? 2
          : undefined;

    const intent: ProjectIntent = {
      summary: prompt.trim().slice(0, 160),
      useCase,
      ...(horizonYears != null ? { horizonYears } : {}),
      ...(householdTotal != null
        ? { household: { total: householdTotal } }
        : {}),
      ...(placeTags.length ? { placeTags } : {}),
      inferredMarkets: `Mock parse selected ${markets.length} market(s) from the prompt.`,
      ...(downPayment != null || totalCash != null
        ? {
            capitalStory: [
              downPayment != null ? `Down payment $${downPayment}` : null,
              totalCash != null ? `Cash/savings $${totalCash}` : null,
            ]
              .filter(Boolean)
              .join("; "),
          }
        : {}),
      ...(liveThenStr
        ? { strategyArc: { nearTerm: "owner" as const, later: "STR" as const } }
        : {}),
      ...(warnings.length ? { warnings } : {}),
    };

    const thinCapital =
      (totalCash != null && totalCash < 50_000) ||
      (downPayment != null && downPayment < 50_000);
    if (thinCapital) {
      intent.warnings = [
        ...(intent.warnings ?? []),
        "Thin capital — LTV may need to be high; confirm financing fit.",
      ];
    }

    const constraints: ProjectConstraints = ProjectConstraintsSchema.parse({
      markets,
      priceMax,
      downPayment,
      totalCash,
      targetMonthlyCashflow,
      bedsMin,
      propertyTypes,
      minDSCR: isLand ? 0 : 1.0,
      strategy,
      mortgage: {
        rateAPR: 0.075,
        termYears: 30,
        ltv:
          downPayment && priceMax
            ? Math.max(0.55, 1 - downPayment / priceMax)
            : thinCapital
              ? 0.9
              : 0.75,
        interestOnly: false,
      },
      notes: prompt,
      intent,
    });
    return constraints;
  }

  async rankDeals(args: {
    userPrompt: string;
    constraints: ProjectConstraints;
    deals: DealScoreInput[];
  }): Promise<DealScoreOutput[]> {
    const target = args.constraints.targetMonthlyCashflow ?? 0;
    const intent = args.constraints.intent;
    const placeTags = (intent?.placeTags ?? []).map((t) => t.toLowerCase());
    const useCase = intent?.useCase;

    return args.deals.map((d) => {
      let score = 50;
      const isLand = d.isLand || useCase === "land_hold" || useCase === "land_develop";

      if (isLand) {
        // Land: prefer lower price/acre and larger lots; skip DSCR gates.
        if (d.pricePerAcre != null && d.pricePerAcre < 50_000) score += 20;
        else if (d.pricePerAcre != null) score += 5;
        if (d.lotSizeSqft != null && d.lotSizeSqft >= 43_560) score += 10;
        if (d.priceCutPct != null && d.priceCutPct > 0) score += 8;
      } else {
        if (d.dscr >= 1.25) score += 25;
        else if (d.dscr >= 1.0) score += 10;
        else score -= 20;

        if (target > 0) {
          if (d.monthlyCashflow >= target) score += 20;
          else if (d.monthlyCashflow >= target * 0.75) score += 5;
          else score -= 10;
        }
      }

      // Intent / place-tag soft boost when address mentions a tag token.
      const addr = (d.address ?? "").toLowerCase();
      if (placeTags.some((t) => addr.includes(t) || t.length > 3)) {
        score += 3;
      }
      if (
        (useCase === "owner_occupy_then_str" ||
          useCase === "lifestyle_second_home" ||
          useCase === "primary_residence") &&
        d.beds != null &&
        args.constraints.bedsMin != null &&
        d.beds >= args.constraints.bedsMin
      ) {
        score += 8;
      }

      score = Math.max(0, Math.min(100, score));
      const cashStr = `$${Math.round(d.monthlyCashflow)}/mo`;
      const dscrStr = d.dscr.toFixed(2);
      let rationale: string;
      if (isLand) {
        const acres =
          d.lotSizeSqft != null
            ? (d.lotSizeSqft / 43_560).toFixed(1)
            : "?";
        const ppa =
          d.pricePerAcre != null
            ? `$${Math.round(d.pricePerAcre).toLocaleString()}/acre`
            : "n/a $/acre";
        rationale = `${acres} acres at ${ppa} — land underwrite (no rental DSCR).`;
      } else if (d.dscr >= 1.0) {
        rationale = `${cashStr} cash flow at ${dscrStr} DSCR — covers debt service.`;
      } else {
        rationale = `${cashStr} cash flow at ${dscrStr} DSCR — below 1.0 means negative coverage; only proceed with reserves.`;
      }
      if (intent?.useCase) {
        rationale += ` Fits ${intent.useCase.replace(/_/g, " ")}.`;
      }
      return { dealId: d.dealId, score, rationale };
    });
  }

  /** Offline stand-in: reuses deterministic slug parsers. */
  async extractListingAddress(args: {
    url: string;
    platform?: string;
  }): Promise<ListingAddressHint | null> {
    const platform = (args.platform ?? "unknown") as ListingUrlPlatform;
    const { hint } = extractAddressFromListingUrl(platform, args.url);
    if (!hint) return null;
    return { ...hint, source: "llm" };
  }

  /**
   * Deterministic offline stand-in for vision analysis — no network,
   * returns a light-cosmetic assessment scaled loosely to price.
   */
  async analyzePropertyCondition(
    args: AnalyzePropertyConditionArgs,
  ): Promise<PropertyConditionAssessment> {
    const n = args.photoUrls.filter(
      (u) => typeof u === "string" && /^https?:\/\//i.test(u),
    ).length;
    if (n === 0) throw new Error("no usable photo URLs to analyze");

    const price = args.price && args.price > 0 ? args.price : 300_000;
    const rehabSuggested = Math.round(
      Math.min(25_000, Math.max(2_500, price * 0.02)),
    );
    const maintenanceMonthlySuggested = Math.max(
      100,
      Math.round((price * 0.01) / 12),
    );

    return {
      overall: "light_cosmetic",
      summary:
        "Mock condition review (no vision API). Assumes light cosmetic work typical for a listing-photo underwrite; replace with a live Claude analysis in production.",
      findings: [
        {
          id: "mock-cosmetic-1",
          severity: "cosmetic",
          category: "interior",
          title: "Cosmetic refresh likely",
          detail:
            "Offline mock: paint, flooring touch-ups, and minor fixture updates commonly needed after listing photos.",
          photoIndexes: n > 0 ? [0] : [],
          estimatedCostLow: Math.round(rehabSuggested * 0.5),
          estimatedCostHigh: Math.round(rehabSuggested * 1.5),
          costBucket: "rehab",
          confidence: "low",
        },
      ],
      rehabLow: Math.round(rehabSuggested * 0.5),
      rehabHigh: Math.round(rehabSuggested * 1.5),
      rehabSuggested,
      maintenanceMonthlySuggested,
      disclaimer: CONDITION_DISCLAIMER,
    };
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

function parseMarkets(
  prompt: string,
): ProjectConstraints["markets"] {
  const lower = prompt.toLowerCase();

  // Known region phrases → concrete cities (scout expands further if needed)
  for (const phrase of [
    "east bay",
    "bay area",
    "sf bay area",
    "near sf",
    "near san francisco",
    "coastal near sf",
    "lake tahoe",
    "near tahoe",
    "twin cities",
    "dmv",
  ]) {
    if (lower.includes(phrase)) {
      const alias = lookupRegionAlias(phrase);
      if (alias) {
        return alias.slice(0, 4).map((c) => ({
          kind: "city" as const,
          city: c.city,
          state: c.state,
        }));
      }
      return [
        {
          kind: "near" as const,
          place: phrase,
          radiusMiles: 30,
          state: "CA",
        },
      ];
    }
  }

  const STATE_NAMES: Record<string, string> = {
    california: "CA",
    texas: "TX",
    florida: "FL",
    oregon: "OR",
    washington: "WA",
    colorado: "CO",
    arizona: "AZ",
    nevada: "NV",
  };
  const stateOnly = prompt.match(
    /\bin\s+(California|Texas|Florida|Oregon|Washington|Colorado|Arizona|Nevada)\b/i,
  );
  if (stateOnly) {
    const st = STATE_NAMES[stateOnly[1]!.toLowerCase()] ?? "CA";
    return [{ kind: "state", state: st }];
  }

  const m = prompt.match(
    /in\s+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)*)(?:,?\s+([A-Z]{2}))?/,
  );
  if (m) {
    const city = m[1]!.trim();
    // Don't treat a bare state name as a city
    if (STATE_NAMES[city.toLowerCase()]) {
      return [{ kind: "state", state: STATE_NAMES[city.toLowerCase()]! }];
    }
    const state = m[2] && STATE_ABBR.has(m[2]) ? m[2] : "CA";
    return [{ kind: "city", city, state }];
  }

  return [{ kind: "city", city: "Austin", state: "TX" }];
}
