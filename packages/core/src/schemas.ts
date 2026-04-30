import { z } from "zod";

export const StrategySchema = z.enum(["LTR", "STR"]);
export type Strategy = z.infer<typeof StrategySchema>;

export const PropertyTypeSchema = z.enum([
  "single_family",
  "condo",
  "townhouse",
  "multi_family_2_4",
  "multi_family_5_plus",
  "any",
]);
export type PropertyType = z.infer<typeof PropertyTypeSchema>;

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

export const ProjectConstraintsSchema = z.object({
  markets: z.array(MarketSchema).min(1),
  priceMin: z.number().nonnegative().optional(),
  priceMax: z.number().positive().optional(),
  bedsMin: z.number().int().nonnegative().optional(),
  bathsMin: z.number().nonnegative().optional(),
  sqftMin: z.number().nonnegative().optional(),
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
