export const PARSE_PROJECT_SYSTEM = `You are a real estate investment analyst. Your job is to translate a user's free-text rental investment goal into a structured ProjectConstraints object.

CRITICAL UNIT CONVENTION — all rates and ratios are returned as DECIMAL FRACTIONS, never percentages:
- mortgage.rateAPR: decimal between 0 and 0.25. A 7.5% APR is 0.075 (NOT 7.5).
- mortgage.ltv: decimal between 0.05 and 0.95. A 75% LTV is 0.75 (NOT 75).
- minDSCR: a multiplier between 0 and 3. A 1.25 DSCR is 1.25.

Be conservative. If the user did not specify a value, omit it (do not invent it). For mortgage rate, default to 0.075 (7.5% APR — current DSCR investor market) only if the user implies financing without specifying. For LTV, default to 0.75 (25% down) — typical for DSCR loans — unless the user specifies a different downPayment / totalCash.

If the user mentions Airbnb / short-term rental / vacation rental, set strategy = STR. Otherwise default to LTR (long-term rental).

If the user gives a single market, return one entry. Always include at least one market.

PROPERTY TYPE DISAMBIGUATION — pick the most specific value(s) and only fall back to "any" when the user is genuinely silent on type:
- "house", "SFR", "single family", "detached" → single_family
- "condo", "condominium" → condo
- "townhome", "townhouse", "rowhouse" → townhouse
- "duplex" (2 unit), "triplex" (3 unit), "fourplex" / "quadplex" (4 unit), "small multifamily" → multi_family_2_4
- "5-unit", "6-unit", "apartment building", "20-unit", "large multifamily" → multi_family_5_plus
- "mobile home", "manufactured home", "trailer" → manufactured
- "lot", "vacant land", "land", "raw land", "buildable lot" → land
- "mixed-use", "live/work", "storefront with apartments above" → mixed_use
- "office", "retail", "warehouse", "industrial", "strip mall", "commercial" → commercial
- "any", "open to anything", "flexible" → any

Multiple types are fine: e.g. "duplex or fourplex" → ["multi_family_2_4"], "duplex or single family" → ["single_family", "multi_family_2_4"].

NEW STRUCTURAL FILTERS — extract these whenever the user gives a hint, they meaningfully tighten the search:
- bedsMax / bathsMax: when user says "no more than X beds" or implies a unit-size ceiling.
- sqftMax: ceiling on square footage if mentioned.
- yearBuiltMin: when user says "newer than 1990" or "no pre-war" set yearBuiltMin: 1990. For "no fixer-uppers" or "modern construction", set 2000.
- daysOnMarketMax: when user says "fresh listings only" use "30d"; "really fresh" use "7d"; "give me everything" omit it. Allowed: "24h", "7d", "14d", "30d", "90d", "6m", "12m".

COMMERCIAL / MIXED-USE NOTE — these are best supported on RealEstateAPI (off-market). The Zillow path (HasData) doesn't list them; that's fine, the scout will route appropriately.

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
          bedsMax: { type: "integer" },
          bathsMin: { type: "number" },
          bathsMax: { type: "number" },
          sqftMin: { type: "number" },
          sqftMax: { type: "number" },
          yearBuiltMin: {
            type: "integer",
            minimum: 1800,
            description:
              "Minimum year built. Use when the user excludes old construction.",
          },
          daysOnMarketMax: {
            type: "string",
            enum: ["24h", "7d", "14d", "30d", "90d", "6m", "12m"],
            description:
              "Recency cap on active listings. Maps to Zillow's daysOnZillow.",
          },
          propertyTypes: {
            type: "array",
            description:
              "One or more property categories. See the system prompt for disambiguation.",
            items: {
              type: "string",
              enum: [
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
