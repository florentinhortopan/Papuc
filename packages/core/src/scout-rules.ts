/**
 * Scout policy + credit cost model.
 *
 * Source of truth for humans: `./scout-rules.json`
 * Runtime helpers resolve tier × trigger → search caps and estimate HasData
 * burn so pricing / overhead stays visible next to product rules.
 */

import rawRules from "./scout-rules.json";
import type { ListingRecency } from "./schemas";

export type SubscriptionTier = "free" | "pro";
export type ScoutTriggerKind = "manual" | "scheduled";

export interface ScoutTriggerRule {
  enabled: boolean;
  /** Max listings to keep after pagination. */
  targetCount: number;
  /** Cap on HasData listing pages (each page costs credits). */
  maxPages: number;
  /**
   * Ceiling on listing age sent as HasData `daysOnZillow`.
   * Combined with the project's own daysOnMarketMax via the tighter window.
   */
  daysOnZillow: ListingRecency;
  /** Drop zpids already stored on the project before pro-forma / upsert. */
  skipKnownProperties: boolean;
  rationale?: string;
}

export interface ScoutRulesFile {
  version: number;
  description?: string;
  providerCredits: {
    hasdata: {
      zillowListingPage: number;
      zillowPropertyDetail: number;
      listingsPerPageApprox: number;
      note?: string;
    };
    realestateapi: {
      propertySearch: number;
      propertyDetail: number;
      note?: string;
    };
  };
  costModel: {
    /** Planning estimate: USD per HasData credit (replace from invoice). */
    usdPerHasDataCredit: number;
    proMonthlyUsd: number;
    notes?: string;
  };
  tiers: Record<
    SubscriptionTier,
    Record<ScoutTriggerKind, ScoutTriggerRule>
  >;
}

export interface ResolvedScoutRule extends ScoutTriggerRule {
  tier: SubscriptionTier;
  trigger: ScoutTriggerKind;
}

export interface ScoutCreditEstimate {
  listingPages: number;
  listingCredits: number;
  /** Detail calls are optional; default estimate assumes 0 on hot path. */
  detailCredits: number;
  totalCredits: number;
  estimatedUsd: number;
  usdPerHasDataCredit: number;
  proMonthlyUsd: number;
  /** Rough scouts/month that fit inside Pro MRR at this rule's listing burn. */
  proScoutsPerMonthAtRule: number;
}

const RECENCY_HOURS: Record<ListingRecency, number> = {
  "24h": 24,
  "7d": 24 * 7,
  "14d": 24 * 14,
  "30d": 24 * 30,
  "90d": 24 * 90,
  "6m": 24 * 182,
  "12m": 24 * 365,
};

/** Parsed JSON config (mutable only by editing the JSON file). */
export const SCOUT_RULES: ScoutRulesFile = rawRules as ScoutRulesFile;

export function resolveScoutRule(
  tier: SubscriptionTier,
  trigger: ScoutTriggerKind,
): ResolvedScoutRule {
  const tierRules = SCOUT_RULES.tiers[tier];
  if (!tierRules) {
    throw new Error(`Unknown subscription tier for scout rules: ${tier}`);
  }
  const rule = tierRules[trigger];
  if (!rule) {
    throw new Error(`Unknown scout trigger for rules: ${trigger}`);
  }
  return { ...rule, tier, trigger };
}

/**
 * Effective `daysOnZillow`: tighter of project preference and tier rule.
 * Always applies the rule ceiling so manual + nightly stay on recent inventory.
 */
export function resolveEffectiveDaysOnZillow(
  projectDaysOnMarketMax: ListingRecency | undefined,
  ruleDaysOnZillow: ListingRecency,
): ListingRecency {
  if (!projectDaysOnMarketMax) return ruleDaysOnZillow;
  return tighterRecency(projectDaysOnMarketMax, ruleDaysOnZillow);
}

export function tighterRecency(
  a: ListingRecency,
  b: ListingRecency,
): ListingRecency {
  return RECENCY_HOURS[a] <= RECENCY_HOURS[b] ? a : b;
}

export function estimateScoutCredits(
  rule: Pick<ScoutTriggerRule, "maxPages" | "targetCount">,
  options: { detailCalls?: number } = {},
): ScoutCreditEstimate {
  const { hasdata } = SCOUT_RULES.providerCredits;
  const { usdPerHasDataCredit, proMonthlyUsd } = SCOUT_RULES.costModel;

  const byTarget = Math.ceil(
    Math.max(0, rule.targetCount) / Math.max(1, hasdata.listingsPerPageApprox),
  );
  const listingPages = Math.max(
    0,
    Math.min(rule.maxPages, byTarget || (rule.maxPages > 0 ? 1 : 0)),
  );
  const listingCredits = listingPages * hasdata.zillowListingPage;
  const detailCredits =
    Math.max(0, options.detailCalls ?? 0) * hasdata.zillowPropertyDetail;
  const totalCredits = listingCredits + detailCredits;
  const estimatedUsd = totalCredits * usdPerHasDataCredit;
  const proScoutsPerMonthAtRule =
    totalCredits > 0
      ? Math.floor(proMonthlyUsd / Math.max(estimatedUsd, 0.0001))
      : Number.POSITIVE_INFINITY;

  return {
    listingPages,
    listingCredits,
    detailCredits,
    totalCredits,
    estimatedUsd,
    usdPerHasDataCredit,
    proMonthlyUsd,
    proScoutsPerMonthAtRule,
  };
}

/** Flat table for dashboards / pricing reviews. */
export function listScoutRuleCostRows(): Array<{
  tier: SubscriptionTier;
  trigger: ScoutTriggerKind;
  enabled: boolean;
  daysOnZillow: ListingRecency;
  targetCount: number;
  maxPages: number;
  skipKnownProperties: boolean;
  listingCredits: number;
  estimatedUsd: number;
  proScoutsPerMonthAtRule: number;
  rationale?: string;
}> {
  const tiers: SubscriptionTier[] = ["free", "pro"];
  const triggers: ScoutTriggerKind[] = ["manual", "scheduled"];
  const rows = [];
  for (const tier of tiers) {
    for (const trigger of triggers) {
      const rule = resolveScoutRule(tier, trigger);
      const cost = estimateScoutCredits(rule);
      rows.push({
        tier,
        trigger,
        enabled: rule.enabled,
        daysOnZillow: rule.daysOnZillow,
        targetCount: rule.targetCount,
        maxPages: rule.maxPages,
        skipKnownProperties: rule.skipKnownProperties,
        listingCredits: cost.listingCredits,
        estimatedUsd: cost.estimatedUsd,
        proScoutsPerMonthAtRule: cost.proScoutsPerMonthAtRule,
        rationale: rule.rationale,
      });
    }
  }
  return rows;
}
