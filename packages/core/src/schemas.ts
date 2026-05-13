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
  z.object({
    kind: z.literal("polygon"),
    polygon: z.array(z.tuple([z.number(), z.number()])),
  }),
]);
export type Market = z.infer<typeof MarketSchema>;

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
 * keep the contract loose; the canonical Zillow tokens are listed in
 * the comment below.
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
  yearBuiltMin: z
    .number()
    .int()
    .min(1800)
    .max(new Date().getFullYear())
    .optional(),
  /** Restrict to listings posted within the last N days/months. */
  daysOnMarketMax: ListingRecencySchema.optional(),
  propertyTypes: z.array(PropertyTypeSchema).default(["single_family"]),
  downPayment: z.number().nonnegative().optional(),
  totalCash: z.number().nonnegative().optional(),
  targetMonthlyCashflow: z.number().optional(),
  minDSCR: z.number().min(0).max(3).default(1.0),
  strategy: StrategySchema.default("LTR"),
  mortgage: MortgageSchema,
  notes: z.string().optional(),
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
