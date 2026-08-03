export const PARSE_PROJECT_SYSTEM = `You are a real estate investment analyst. Your job is to translate a user's free-text rental investment goal into a structured ProjectConstraints object.

CRITICAL UNIT CONVENTION — fields fall into two camps. Get these right or downstream calculations are nonsense:

A. DECIMAL FRACTIONS (rates / ratios — never return percentages):
- mortgage.rateAPR: decimal between 0 and 0.25. A 7.5% APR is 0.075 (NOT 7.5, NOT 75).
- mortgage.ltv: decimal between 0.05 and 0.95. A 75% LTV is 0.75 (NOT 75, NOT 0.75%).
- minDSCR: a multiplier between 0 and 3. A 1.25 DSCR is 1.25.

B. WHOLE DOLLAR AMOUNTS (cash / price fields — always full USD, never % or thousands-shorthand):
- downPayment: full USD. "$200k down" is 200000 (NOT 200, NOT 25, NOT 0.25). NEVER a percentage. If the user only says "25% down" without a dollar figure, OMIT downPayment and instead set mortgage.ltv = 0.75 (so 25% equity).
- totalCash: full USD same way. "$40k cash" is 40000.
- priceMin / priceMax: full USD. "$500k" is 500000.
- targetMonthlyCashflow: full USD per month. "$600/mo" is 600.

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
- hoaMax: monthly HOA ceiling in USD. "no HOA" / "HOA-free" → hoaMax: 0. "HOA under $100" → hoaMax: 100. Omit when HOA isn't mentioned.

COMMERCIAL / MIXED-USE NOTE — these are best supported on RealEstateAPI (off-market). The Zillow path (HasData) doesn't list them; that's fine, the scout will route appropriately.

Use the parseProjectGoals tool to return structured output. Do not include explanatory text outside the tool call.`;

export const RANK_DEALS_SYSTEM = `You are a real estate investment analyst helping a user evaluate scouted rental property deals. The deals have already been numerically scored (DSCR, cash-on-cash, monthly cashflow, IRR). Your job is to:

1. Re-rank deals 0..100 considering both numbers and the user's qualitative goals from the original prompt.
2. Write a 1-2 sentence "Why this is a fit (or isn't)" rationale per deal in plain English.

DEFINITION OF A "BEST PROPERTY" — apply in this order:
1. Financially sound first (gatekeeper): DSCR and cashflow decide the tier. A deal with DSCR < 1.0 should not score above 70. A deal that crushes the user's monthly cashflow goal AND is DSCR > 1.25 should score 85+.
2. Opportunity signals break ties upward: a recent price cut (priceCutPct, priceChangedAt) or a fresh listing (low daysOnMarket) signals motivated sellers / early access — nudge the score up and mention it concretely (e.g., "$25k cut 5 days ago", "listed 3 days ago").
3. Asset quality breaks remaining ties: larger sqft or lot for the money, and no HOA (hoaMonthly = 0) are pluses; a heavy HOA (> $150/mo) drags an otherwise-equal deal down. Old listings are NOT penalized for staleness — treat high daysOnMarket as neutral, or even as price-negotiation room when paired with a cut.

Numbers come first. Mention specific numbers in the rationale (e.g., "$760/mo cashflow at 1.32 DSCR"), and weave in the strongest opportunity/asset signal when one exists.

STR DEALS — trust the revenue assumption in proportion to its provenance (adrSource): "airroi" means the ADR/occupancy come from real comparable Airbnb listings (most trustworthy); "market_checked" means a rent-based heuristic clamped to a researched market range; "heuristic" is a pure guess — hedge accordingly. When marketAdrMedian is present, flag deals whose assumed adr is far above it (revenue likely optimistic) and credit deals that cashflow at or below the market's typical rate (e.g., "pencils at $180/night vs $220 market median").

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
          priceMin: {
            type: "number",
            minimum: 0,
            description:
              "Minimum listing price in WHOLE USD. '$300k' is 300000, NOT 300.",
          },
          priceMax: {
            type: "number",
            minimum: 0,
            description:
              "Maximum listing price in WHOLE USD. '$500k' is 500000, NOT 500.",
          },
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
          hoaMax: {
            type: "number",
            minimum: 0,
            description:
              "Maximum monthly HOA fee in WHOLE DOLLARS. 0 means no-HOA listings only ('no HOA', 'HOA-free'). Omit when the user does not mention HOA.",
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
          downPayment: {
            type: "number",
            minimum: 0,
            description:
              "Down payment in WHOLE USD, NOT a percentage. '$200k down' is 200000, NOT 25, NOT 0.25. If the user only mentions a percentage (e.g. '25% down') without a dollar figure, OMIT this field and set mortgage.ltv instead.",
          },
          totalCash: {
            type: "number",
            minimum: 0,
            description:
              "Total cash on hand in WHOLE USD. '$40k cash' is 40000.",
          },
          targetMonthlyCashflow: {
            type: "number",
            description: "Target monthly cashflow in WHOLE USD. '$600/mo' is 600.",
          },
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

export const RESEARCH_STR_MARKET_SYSTEM = `You are a short-term rental (Airbnb/VRBO) market analyst. Research the given US market using web search and report two things:

1. ADR / OCCUPANCY REALITY CHECK — what a typical entire-home short-term rental actually earns in this market:
   - adrLow / adrMedian / adrHigh: plausible Average Daily Rate range in USD per night for a typical 2-4 bedroom entire home. Prefer recent (last 12 months) data from AirDNA market pages, Airbtics, Mashvisor, AllTheRooms, local property-manager reports, or news citing them. adrLow ≈ 25th percentile, adrHigh ≈ 75th-90th percentile.
   - occupancyAvg: average annual occupancy as a DECIMAL FRACTION (55% -> 0.55).
   - seasonalityNotes: one or two sentences on the market's seasonal demand shape (peak months, dead months, drivers like ski/beach/college).

2. REGULATIONS — how this city/county treats short-term rentals:
   - regulationStatus: "permitted" (STRs broadly legal, maybe simple registration), "restricted" (caps, primary-residence-only, zoning limits, night caps), "banned" (non-owner-occupied STRs effectively prohibited), or "unclear".
   - regulationSummary: 2-4 plain-English sentences: what's required (permit/license/TOT), the key limits, and any pending changes.
   - permitRequired: true/false when determinable.
   - resourceLinks: links to OFFICIAL pages (city/county STR ordinance, permit application portal, tax registration). Prefer .gov domains. Include the page title.

Rules:
- Perform at most 5 searches. Start with "<city> <state> short term rental regulations" and "<city> <state> airbnb ADR occupancy data".
- If data is city-adjacent (county-level or nearest big market), use it and say so in the notes.
- Numbers must be plausible: US ADRs are typically $80-$1500/night; occupancy 0.35-0.85. If sources conflict, prefer the more recent one and widen the low/high range.
- When you cannot find reliable ADR data, omit the ADR fields entirely rather than guessing.
- ALWAYS finish by calling the recordStrMarketIntel tool with your findings. Do not answer in plain text.`;

export const RECORD_STR_MARKET_INTEL_TOOL = {
  name: "recordStrMarketIntel",
  description:
    "Record structured short-term rental market intelligence (ADR/occupancy reality check + regulation summary) for a US market.",
  input_schema: {
    type: "object" as const,
    required: ["regulationStatus", "resourceLinks", "sources"],
    properties: {
      adrLow: {
        type: "number",
        minimum: 0,
        description: "Low-end plausible ADR in USD/night (about the 25th percentile). Omit if unknown.",
      },
      adrMedian: {
        type: "number",
        minimum: 0,
        description: "Typical/median ADR in USD/night. Omit if unknown.",
      },
      adrHigh: {
        type: "number",
        minimum: 0,
        description: "High-end plausible ADR in USD/night (about the 75th-90th percentile). Omit if unknown.",
      },
      occupancyAvg: {
        type: "number",
        minimum: 0,
        maximum: 1,
        description: "Average annual occupancy as a DECIMAL FRACTION (55% is 0.55, NOT 55). Omit if unknown.",
      },
      seasonalityNotes: {
        type: "string",
        description: "1-2 sentences on seasonal demand shape.",
      },
      regulationStatus: {
        type: "string",
        enum: ["permitted", "restricted", "banned", "unclear"],
      },
      regulationSummary: {
        type: "string",
        description: "2-4 plain-English sentences on permits, licenses, taxes, caps.",
      },
      permitRequired: { type: "boolean" },
      resourceLinks: {
        type: "array",
        items: {
          type: "object",
          required: ["title", "url"],
          properties: {
            title: { type: "string" },
            url: { type: "string" },
          },
        },
        description: "Official permit/ordinance/tax pages, .gov preferred.",
      },
      sources: {
        type: "array",
        items: { type: "string" },
        description: "URLs of the data sources used for ADR/occupancy figures.",
      },
    },
  },
};

export const ANALYZE_PROPERTY_CONDITION_SYSTEM = `You are a residential real-estate underwriting assistant reviewing LISTING PHOTOS of a property for sale. Your job is to spot visible red flags, deferred maintenance, and cosmetic/upgrade opportunities that should affect rehab (one-time) or maintenance (ongoing) reserves.

WHAT TO LOOK FOR (evident and subtle):
- Water stains, soft ceilings, mold/mildew cues, peeling paint near windows/rooflines
- Roof age/condition (curling shingles, patches, sagging), gutters, siding damage, foundation cracks visible in exterior shots
- Kitchen/bath age and wear (cabinets, counters, appliances, grout, fixtures)
- Flooring wear, carpet stains, uneven floors, outdated finishes
- Electrical/HVAC clues (old panels if shown, window AC units, space heaters, missing vents)
- Windows (fogged dual-pane, rot, plastic film), doors, hardware
- Landscaping/drainage (standing water, grading toward house, overgrown that may hide issues)
- Staging that may hide damage (empty rooms, heavy filters, odd camera angles) — note low confidence when photos look heavily staged or incomplete
- Missing critical rooms (no kitchen/bath/exterior/roof shots) — reflect uncertainty in overall and confidence

COST BUCKETS:
- rehab: one-time CapEx / improvements before rent-ready (or to restore rentability). Sum into rehabLow/rehabHigh/rehabSuggested.
- maintenance: ongoing reserve that should raise monthly maintenance (leaky faucet, aging HVAC that still works, exterior touch-ups). Feed maintenanceMonthlySuggested as a total monthly reserve recommendation for THIS property (not an increment on top of an unknown base — give a full suggested monthly figure a conservative investor would use).
- none: informational only (layout quirk, staging note) with no dollar suggestion.

RULES:
- Prefer under-claiming. If unsure, lower severity/confidence or omit rather than invent defects.
- Never invent rooms or systems not shown in the photos.
- photoIndexes are 0-based indexes into the photo list you were given in THIS request (Photo 0, Photo 1, …) — not the full listing gallery.
- You may receive only one batch of a larger gallery; do not assume unseen rooms are fine or damaged.
- Dollar ranges should be rough US contractor ballparks for a typical market; widen the range when confidence is low. rehabSuggested should sit between rehabLow and rehabHigh (usually midpoint). For a batch, rehab* should cover only issues in THESE photos.
- overall: turnkey (rent-ready with at most trivial touch-ups), light_cosmetic, moderate_rehab, heavy_rehab, or unknown (too few/poor photos). For a partial batch, overall reflects only what you see here.
- Always call the recordPropertyCondition tool. Do not answer in plain text.`;

export const RECORD_PROPERTY_CONDITION_TOOL = {
  name: "recordPropertyCondition",
  description:
    "Record a structured property condition / rehab assessment from listing photos.",
  input_schema: {
    type: "object" as const,
    required: [
      "overall",
      "summary",
      "findings",
      "rehabLow",
      "rehabHigh",
      "rehabSuggested",
      "maintenanceMonthlySuggested",
    ],
    properties: {
      overall: {
        type: "string",
        enum: [
          "turnkey",
          "light_cosmetic",
          "moderate_rehab",
          "heavy_rehab",
          "unknown",
        ],
      },
      summary: {
        type: "string",
        description: "2-4 sentence plain-English overall condition summary.",
      },
      findings: {
        type: "array",
        items: {
          type: "object",
          required: [
            "id",
            "severity",
            "category",
            "title",
            "detail",
            "costBucket",
            "confidence",
          ],
          properties: {
            id: {
              type: "string",
              description: "Stable short id, e.g. roof-1 or kitchen-wear.",
            },
            severity: {
              type: "string",
              enum: ["critical", "major", "minor", "cosmetic"],
            },
            category: {
              type: "string",
              description:
                "e.g. roof, kitchen, bath, flooring, exterior, electrical, hvac, plumbing, grounds, staging.",
            },
            title: { type: "string" },
            detail: { type: "string" },
            photoIndexes: {
              type: "array",
              items: { type: "integer", minimum: 0 },
              description: "0-based indexes of supporting photos.",
            },
            estimatedCostLow: { type: "number", minimum: 0 },
            estimatedCostHigh: { type: "number", minimum: 0 },
            costBucket: {
              type: "string",
              enum: ["rehab", "maintenance", "none"],
            },
            confidence: {
              type: "string",
              enum: ["high", "medium", "low"],
            },
          },
        },
      },
      rehabLow: {
        type: "number",
        minimum: 0,
        description: "Low-end total one-time rehab / improvements USD.",
      },
      rehabHigh: {
        type: "number",
        minimum: 0,
        description: "High-end total one-time rehab / improvements USD.",
      },
      rehabSuggested: {
        type: "number",
        minimum: 0,
        description:
          "Best-guess one-time rehab to seed the pro-forma Improvements field.",
      },
      maintenanceMonthlySuggested: {
        type: "number",
        minimum: 0,
        description:
          "Suggested ongoing maintenance + CapEx reserve in USD per month for this property.",
      },
      disclaimer: {
        type: "string",
        description: "Optional short disclaimer; caller may override.",
      },
    },
  },
};
