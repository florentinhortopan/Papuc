export const PARSE_PROJECT_SYSTEM = `You are a real estate investment analyst. Your job is to translate a user's free-text rental investment goal into a structured ProjectConstraints object.

CRITICAL UNIT CONVENTION — all rates and ratios are returned as DECIMAL FRACTIONS, never percentages:
- mortgage.rateAPR: decimal between 0 and 0.25. A 7.5% APR is 0.075 (NOT 7.5).
- mortgage.ltv: decimal between 0.05 and 0.95. A 75% LTV is 0.75 (NOT 75).
- minDSCR: a multiplier between 0 and 3. A 1.25 DSCR is 1.25.

Be conservative. If the user did not specify a value, omit it (do not invent it). For mortgage rate, default to 0.075 (7.5% APR — current DSCR investor market) only if the user implies financing without specifying. For LTV, default to 0.75 (25% down) — typical for DSCR loans — unless the user specifies a different downPayment / totalCash.

If the user mentions Airbnb / short-term rental / vacation rental, set strategy = STR. Otherwise default to LTR (long-term rental).

If the user gives a single market, return one entry. Always include at least one market.

Use the parseProjectGoals tool to return structured output. Do not include explanatory text outside the tool call.`;

export const RANK_DEALS_SYSTEM = `You are a real estate investment analyst helping a user evaluate scouted rental property deals. The deals have already been numerically scored (DSCR, cash-on-cash, monthly cashflow, IRR). Your job is to:

1. Re-rank deals 0..100 considering both numbers and the user's qualitative goals from the original prompt.
2. Write a 1-2 sentence "Why this is a fit (or isn't)" rationale per deal in plain English.

Numbers come first. A deal with DSCR < 1.0 should not score above 70. A deal that crushes the user's monthly cashflow goal AND is DSCR > 1.25 should score 85+. Mention specific numbers in the rationale (e.g., "$760/mo cashflow at 1.32 DSCR").

Use the rankDeals tool to return structured output.`;

export const PARSE_PROJECT_TOOL = {
  name: "parseProjectGoals",
  description:
    "Return structured ProjectConstraints derived from the user's free-text investment goal.",
  input_schema: {
    type: "object" as const,
    required: ["constraints"],
    properties: {
      constraints: {
        type: "object",
        required: ["markets", "mortgage", "propertyTypes", "minDSCR", "strategy"],
        properties: {
          markets: {
            type: "array",
            minItems: 1,
            items: {
              oneOf: [
                {
                  type: "object",
                  required: ["kind", "city", "state"],
                  properties: {
                    kind: { const: "city" },
                    city: { type: "string" },
                    state: { type: "string", description: "2-letter state code" },
                  },
                },
                {
                  type: "object",
                  required: ["kind", "zip"],
                  properties: {
                    kind: { const: "zip" },
                    zip: { type: "string" },
                  },
                },
                {
                  type: "object",
                  required: ["kind", "county", "state"],
                  properties: {
                    kind: { const: "county" },
                    county: { type: "string" },
                    state: { type: "string" },
                  },
                },
              ],
            },
          },
          priceMin: { type: "number" },
          priceMax: { type: "number" },
          bedsMin: { type: "integer" },
          bathsMin: { type: "number" },
          sqftMin: { type: "number" },
          propertyTypes: {
            type: "array",
            items: {
              type: "string",
              enum: [
                "single_family",
                "condo",
                "townhouse",
                "multi_family_2_4",
                "multi_family_5_plus",
                "any",
              ],
            },
          },
          downPayment: { type: "number" },
          totalCash: { type: "number" },
          targetMonthlyCashflow: { type: "number" },
          minDSCR: {
            type: "number",
            minimum: 0,
            maximum: 3,
            description: "DSCR multiplier (e.g. 1.25 means cash flow is 1.25x debt service). NOT a percentage.",
          },
          strategy: { type: "string", enum: ["LTR", "STR"] },
          mortgage: {
            type: "object",
            required: ["rateAPR", "termYears", "ltv"],
            properties: {
              rateAPR: {
                type: "number",
                minimum: 0,
                maximum: 0.25,
                description: "Annual percentage rate as a DECIMAL FRACTION. 7.5% APR is 0.075, NOT 7.5.",
              },
              termYears: {
                type: "integer",
                minimum: 5,
                maximum: 40,
                description: "Loan term in years (e.g. 30).",
              },
              ltv: {
                type: "number",
                minimum: 0.05,
                maximum: 0.95,
                description: "Loan-to-value as a DECIMAL FRACTION. 75% LTV is 0.75, NOT 75.",
              },
              interestOnly: { type: "boolean" },
            },
          },
          notes: { type: "string" },
        },
      },
    },
  },
};

export const RANK_DEALS_TOOL = {
  name: "rankDeals",
  description: "Re-rank scouted deals with score 0..100 and write a 1-2 sentence rationale per deal.",
  input_schema: {
    type: "object" as const,
    required: ["rankings"],
    properties: {
      rankings: {
        type: "array",
        items: {
          type: "object",
          required: ["dealId", "score", "rationale"],
          properties: {
            dealId: { type: "string" },
            score: { type: "number", minimum: 0, maximum: 100 },
            rationale: { type: "string" },
          },
        },
      },
    },
  },
};
