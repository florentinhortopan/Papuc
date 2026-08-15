import { z } from "zod";

export const StrategySchema = z.enum(["LTR", "STR"]);
export type Strategy = z.infer<typeof StrategySchema>;

/**
 * Property categories we model end-to-end. Each value maps to a concrete
 * filter on at least one data provider (see `mapPropertyTypeToZillow` and
 * `mapPropertyType` in scouting / realestate).
 *
 * Coverage notes:
 *   - `mixed_use` and `commercial` are RealEstateAPI-only on the search
 *     side; HasData (Zillow) is residential-only and silently skips them.
 *     The scout diagnostics will surface this so the UI can warn.
 *   - `land` and `manufactured` are supported on both providers.
 *   - `multi_family_5_plus` is treated as "apartment building" by Zillow
 *     and as a multi-family code by RealEstateAPI; small (2-4) and large
 *     (5+) multi are intentionally separate to keep DSCR underwriting
 *     accurate (commercial-loan territory above 4 units).
 */
export const PropertyTypeSchema = z.enum([
  "single_family",
  "condo",
  "townhouse",
  "multi_family_2_4",
  "multi_family_5_plus",
  "manufactured",
  "land",
  "mixed_use",
  "commercial",
  "any",
]);
export type PropertyType = z.infer<typeof PropertyTypeSchema>;

/**
 * Human-readable labels for `PropertyType` values. Used in the LLM tool
 * schema descriptions and the review-form UI so we have one source of
 * truth for "what does multi_family_2_4 mean to a real human".
 */
export const PROPERTY_TYPE_LABELS: Record<PropertyType, string> = {
  single_family: "Single-family home",
  condo: "Condo",
  townhouse: "Townhouse",
  multi_family_2_4: "Multi-family (2–4 units)",
  multi_family_5_plus: "Multi-family (5+ units, apartment)",
  manufactured: "Manufactured / mobile home",
  land: "Land / lot",
  mixed_use: "Mixed-use (residential + commercial)",
  commercial: "Commercial",
  any: "Any",
};

export const MarketSchema = z.union([
  z.object({ kind: z.literal("city"), city: z.string(), state: z.string() }),
  z.object({ kind: z.literal("zip"), zip: z.string() }),
  z.object({ kind: z.literal("county"), county: z.string(), state: z.string() }),
  /** State-wide search, e.g. "land in California" → { kind: "state", state: "CA" }. */
  z.object({ kind: z.literal("state"), state: z.string() }),
  /**
   * Vague "near X" geography. Scout expands this into concrete city/zip
   * markets via region aliases — providers have no true radius API.
   */
  z.object({
    kind: z.literal("near"),
    place: z.string(),
    radiusMiles: z.number().positive().default(30),
    state: z.string().optional(),
  }),
  z.object({
    kind: z.literal("polygon"),
    polygon: z.array(z.tuple([z.number(), z.number()])),
  }),
]);
export type Market = z.infer<typeof MarketSchema>;

/**
 * Open taxonomy for free-text project goals. Not niche-locked — any
 * lifestyle / land / hybrid / commercial intent should map here.
 */
export const ProjectUseCaseSchema = z.enum([
  "rental_income",
  "primary_residence",
  "owner_occupy_then_str",
  "lifestyle_second_home",
  "live_work",
  "commercial_ops",
  "land_hold",
  "land_develop",
  "hospitality_str",
  "unclear",
]);
export type ProjectUseCase = z.infer<typeof ProjectUseCaseSchema>;

export const PROJECT_USE_CASE_LABELS: Record<ProjectUseCase, string> = {
  rental_income: "Rental income",
  primary_residence: "Primary residence",
  owner_occupy_then_str: "Live now → short-term later",
  lifestyle_second_home: "Lifestyle / second home",
  live_work: "Live / work",
  commercial_ops: "Commercial operations",
  land_hold: "Land hold",
  land_develop: "Land to develop",
  hospitality_str: "Short-term rental",
  unclear: "Open / unclear",
};

export const StrategyArcPhaseSchema = z.enum(["LTR", "STR", "owner"]);
export type StrategyArcPhase = z.infer<typeof StrategyArcPhaseSchema>;

export const ProjectIntentSchema = z.object({
  /** One-line restatement of the user's goal (not a template). */
  summary: z.string().optional(),
  useCase: ProjectUseCaseSchema.optional(),
  /** Hold / develop / live-then-rent horizon in years when stated. */
  horizonYears: z.number().positive().max(50).optional(),
  household: z
    .object({
      adults: z.number().int().nonnegative().optional(),
      children: z.number().int().nonnegative().optional(),
      total: z.number().int().positive().optional(),
    })
    .optional(),
  /** Free-form place/lifestyle tags from the prompt (model-generated). */
  placeTags: z.array(z.string()).optional(),
  mustHaves: z.array(z.string()).optional(),
  niceToHaves: z.array(z.string()).optional(),
  /** Why these markets were chosen / expanded. */
  inferredMarkets: z.string().optional(),
  /** How savings / down payment language was interpreted. */
  capitalStory: z.string().optional(),
  /**
   * Hybrid timelines: scout `strategy` should follow nearTerm underwriting
   * (owner/LTR for multi-year primary stay); `later` is review-only.
   */
  strategyArc: z
    .object({
      nearTerm: StrategyArcPhaseSchema,
      later: StrategyArcPhaseSchema.optional(),
    })
    .optional(),
  warnings: z.array(z.string()).optional(),
});
export type ProjectIntent = z.infer<typeof ProjectIntentSchema>;

export const MortgageSchema = z.object({
  rateAPR: z.number().min(0).max(0.25).describe("Decimal e.g. 0.075 for 7.5%"),
  termYears: z.number().int().min(5).max(40).default(30),
  ltv: z.number().min(0.05).max(0.95).default(0.75).describe("Loan-to-value (e.g. 0.75 for 25% down)"),
  interestOnly: z.boolean().default(false),
});
export type Mortgage = z.infer<typeof MortgageSchema>;

/**
 * "How fresh must the listing be?" Maps directly to Zillow's
 * `daysOnZillow` parameter when scouting via HasData. Free-form strings
 * keep the contract loose; the canonical Zillow tokens are listed in the
 * comment below.
 */
export const ListingRecencySchema = z
  .enum(["24h", "7d", "14d", "30d", "90d", "6m", "12m"])
  .describe("Max days on market for active listings.");
export type ListingRecency = z.infer<typeof ListingRecencySchema>;

export const ProjectConstraintsSchema = z.object({
  markets: z.array(MarketSchema).min(1),
  priceMin: z.number().nonnegative().optional(),
  priceMax: z.number().positive().optional(),
  bedsMin: z.number().int().nonnegative().optional(),
  bedsMax: z.number().int().nonnegative().optional(),
  bathsMin: z.number().nonnegative().optional(),
  bathsMax: z.number().nonnegative().optional(),
  sqftMin: z.number().nonnegative().optional(),
  sqftMax: z.number().nonnegative().optional(),
  /**
   * Minimum lot size in SQUARE FEET (1 acre = 43,560 sqft). This is the
   * only place a land-size requirement belongs — `sqftMin` is interior
   * living area and would zero out lot searches if misused for acreage.
   */
  lotSizeMinSqft: z.number().nonnegative().optional(),
  yearBuiltMin: z
    .number()
    .int()
    .min(1800)
    .max(new Date().getFullYear())
    .optional(),
  /** Restrict to listings posted within the last N days/months. */
  daysOnMarketMax: ListingRecencySchema.optional(),
  /**
   * Maximum monthly HOA fee in USD. 0 = no-HOA listings only (maps to
   * Zillow's hoa filter via HasData). Omit for "don't care".
   */
  hoaMax: z.number().nonnegative().optional(),
  propertyTypes: z.array(PropertyTypeSchema).default(["single_family"]),
  downPayment: z.number().nonnegative().optional(),
  totalCash: z.number().nonnegative().optional(),
  targetMonthlyCashflow: z.number().optional(),
  minDSCR: z.number().min(0).max(3).default(1.0),
  strategy: StrategySchema.default("LTR"),
  mortgage: MortgageSchema,
  notes: z.string().optional(),
  /** Broad free-text goal inference (optional — older projects omit it). */
  intent: ProjectIntentSchema.optional(),
});
export type ProjectConstraints = z.infer<typeof ProjectConstraintsSchema>;

export const PITIASchema = z.object({
  principalAndInterest: z.number(),
  taxes: z.number(),
  insurance: z.number(),
  hoa: z.number(),
  pmi: z.number(),
  total: z.number(),
});
export type PITIA = z.infer<typeof PITIASchema>;

export const ProFormaResultSchema = z.object({
  monthlyRevenue: z.array(z.number()).length(12),
  monthlyVariableCosts: z.array(z.number()).length(12),
  monthlyContributions: z.array(z.number()).length(12),
  monthlyFixedCosts: z.array(z.number()).length(12),
  monthlyPreTaxProfit: z.array(z.number()).length(12),
  annualRevenue: z.number(),
  annualPreTaxProfit: z.number(),
  annualPostTaxProfit: z.number(),
  initialSunkInvestment: z.number(),
  cashOnCashReturn: z.number(),
  payoutYears: z.number(),
  irr5Yr: z.number().nullable(),
  equityMultiple5Yr: z.number(),
  pitiaMonthly: PITIASchema,
  dscr: z.number(),
  dscrLenderHaircut: z.number(),
});
export type ProFormaResult = z.infer<typeof ProFormaResultSchema>;
