export const PARSE_PROJECT_SYSTEM = `You are a real estate investment analyst. Translate ANY free-text life or investment goal into structured ProjectConstraints — not only classic rental searches. Goals may be rental cashflow, primary residence, live-then-Airbnb, lifestyle place-based, live/work, commercial ops, land hold, or land to develop later. Treat every goal class as first-class; do not specialize around one lifestyle niche.

CRITICAL UNIT CONVENTION — fields fall into two camps. Get these right or downstream calculations are nonsense:

A. DECIMAL FRACTIONS (rates / ratios — never return percentages):
- mortgage.rateAPR: decimal between 0 and 0.25. A 7.5% APR is 0.075 (NOT 7.5, NOT 75).
- mortgage.ltv: decimal between 0.05 and 0.95. A 75% LTV is 0.75 (NOT 75, NOT 0.75%).
- minDSCR: a multiplier between 0 and 3. A 1.25 DSCR is 1.25.

B. WHOLE DOLLAR AMOUNTS (cash / price fields — always full USD, never % or thousands-shorthand):
- downPayment: full USD. "$200k down" is 200000 (NOT 200, NOT 25, NOT 0.25). NEVER a percentage. If the user only says "25% down" without a dollar figure, OMIT downPayment and instead set mortgage.ltv = 0.75 (so 25% equity).
- totalCash: full USD same way. "$40k cash" / "I have 20k in savings" is 40000 / 20000.
- priceMin / priceMax: full USD. "$500k" is 500000.
- targetMonthlyCashflow: full USD per month. "$600/mo" is 600.

Be conservative. If the user did not specify a value, omit it (do not invent it). For mortgage rate, default to 0.075 (7.5% APR — current DSCR investor market) only if the user implies financing without specifying. For LTV, default to 0.75 (25% down) — typical for DSCR loans — unless the user specifies a different downPayment / totalCash. Thin capital ("I only have 20k") → set totalCash and a realistic high ltv (e.g. 0.9) or omit downPayment; explain in intent.capitalStory.

INTENT FIRST — before filling filters, populate constraints.intent:
- summary: one sentence restating THEIR goal (not a template).
- useCase: one of rental_income | primary_residence | owner_occupy_then_str | lifestyle_second_home | live_work | commercial_ops | land_hold | land_develop | hospitality_str | unclear.
- horizonYears: when they give a timeline ("5 years", "live a few years then Airbnb").
- household: adults/children/total when family size is stated (family of 4 → total: 4; usually bedsMin >= 3).
- placeTags: free-form tags taken from the prompt (mountain, coastal, urban, walkable, east_bay, …) — invent nothing niche-specific; only what they said or clearly implied.
- mustHaves / niceToHaves: short strings.
- inferredMarkets: why you chose these markets.
- capitalStory: how you interpreted savings / down payment.
- strategyArc: for hybrids, e.g. { nearTerm: "owner", later: "STR" } when they will live first then short-term rent. Scout strategy field should follow near-term underwriting: owner/primary multi-year stay → strategy LTR (not STR) unless they want STR immediately.
- warnings: e.g. mixed_use/commercial need a non-Zillow scout path; land has no rental DSCR; thin capital.

STRATEGY:
- Explicit Airbnb / STR / vacation rental as the NOW use → strategy = STR, useCase hospitality_str (or owner_occupy_then_str if they live first).
- Live for years then Airbnb → strategy = LTR, useCase = owner_occupy_then_str, strategyArc.nearTerm = owner, later = STR.
- Pure rental investor → strategy LTR or STR as stated, useCase rental_income.
- Otherwise default strategy LTR.

MARKET KINDS — pick the most specific shape; expand vague regions into MULTIPLE concrete markets (up to 5):
- City ("Austin, TX") → { kind: "city", city: "Austin", state: "TX" }.
- Zip → { kind: "zip", zip: "78704" }.
- County ("Placer County") → { kind: "county", county: "Placer", state: "CA" }.
- Whole state ("California") → { kind: "state", state: "CA" }. NEVER fabricate a city for a state-wide request.
- Vague region / "near X" → prefer several city markets (e.g. East Bay → Oakland, Berkeley, Alameda, Richmond; near SF coastal → Pacifica, Half Moon Bay, Daly City). You may also emit { kind: "near", place: "East Bay", radiusMiles: 30, state: "CA" } when unsure of the city list; scout will expand aliases.
- Always include at least one market. Put the expansion rationale in intent.inferredMarkets.

LAND / LOT SIZE — land size lives in lotSizeMinSqft, ALWAYS in square feet (1 acre = 43,560 sqft). NEVER put land/lot size into sqftMin/sqftMax. For land_hold / land_develop: propertyTypes ["land"], omit beds/baths/sqft unless a structure is asked for; set horizonYears when they say "develop in N years".

PROPERTY TYPE DISAMBIGUATION — pick the most specific value(s); only use "any" when genuinely silent on type:
- house / SFR / detached → single_family
- condo → condo
- townhome / townhouse → townhouse
- duplex/triplex/fourplex / small multifamily → multi_family_2_4
- apartment building / 5+ units → multi_family_5_plus
- mobile / manufactured → manufactured
- lot / vacant land / raw land → land
- mixed-use / live/work / storefront with apartments above → mixed_use
- office / retail / warehouse / commercial → commercial

NEW STRUCTURAL FILTERS — extract when hinted:
- bedsMax / bathsMax / sqftMax / yearBuiltMin / daysOnMarketMax / hoaMax as before.
- Household size → bedsMin when implied (family of 4 → bedsMin 3 unless they say otherwise).

COMMERCIAL / MIXED-USE — best on RealEstateAPI; Zillow path won't list them. Add intent.warnings accordingly.

notes — residual unmappable desire (guided, not a dump of the whole prompt). Prefer structured mustHaves/niceToHaves/placeTags first.

Use the parseProjectGoals tool to return structured output. Do not include explanatory text outside the tool call.`;

export const RANK_DEALS_SYSTEM = `You are a real estate investment analyst helping a user evaluate scouted rental property deals. The deals have already been numerically scored (DSCR, cash-on-cash, monthly cashflow, IRR). Your job is to:

1. Re-rank deals 0..100 considering both numbers and the user's qualitative goals from the original prompt AND constraints.intent (useCase, placeTags, mustHaves, horizon, strategyArc) when present.
2. Write a 1-2 sentence "Why this is a fit (or isn't)" rationale per deal in plain English.

DEFINITION OF A "BEST PROPERTY" — apply in this order:
1. Financially sound first (gatekeeper): DSCR and cashflow decide the tier. A deal with DSCR < 1.0 should not score above 70. A deal that crushes the user's monthly cashflow goal AND is DSCR > 1.25 should score 85+. For primary / owner_occupy_then_str / lifestyle goals, still prefer solvent underwriting but weigh beds/location/placeTags more than pure cashflow.
2. Opportunity signals break ties upward: a recent price cut (priceCutPct, priceChangedAt) or a fresh listing (low daysOnMarket) signals motivated sellers / early access — nudge the score up and mention it concretely (e.g., "$25k cut 5 days ago", "listed 3 days ago").
3. Asset quality + intent fit break remaining ties: larger sqft or lot for the money, no HOA, and alignment with intent.placeTags / mustHaves / useCase. A heavy HOA (> $150/mo) drags an otherwise-equal deal down. Old listings are NOT penalized for staleness — treat high daysOnMarket as neutral, or even as price-negotiation room when paired with a cut.

Numbers come first for rental_income. Mention specific numbers in the rationale (e.g., "$760/mo cashflow at 1.32 DSCR"), and weave in the strongest opportunity/asset/intent signal when one exists.

LAND DEALS (isLand: true) — vacant land has no rent, so DSCR/cashflow are not meaningful gates: dscr is 0 and monthlyCashflow is just the (negative) monthly carrying cost. Do NOT apply rule 1's DSCR tiers to land. Instead rank land on value per acre (pricePerAcre vs. the batch's peers — cheaper is better), price cuts, freshness, lot size vs intent (land_hold / land_develop / horizonYears), and how well the lot fits the stated goal. Mention acreage and price per acre in the rationale.

STR DEALS — trust the revenue assumption in proportion to its provenance (adrSource): "airroi" means the ADR/occupancy come from real comparable Airbnb listings (most trustworthy); "market_checked" means a rent-based heuristic clamped to a researched market range; "heuristic" is a pure guess — hedge accordingly. When marketAdrMedian is present, flag deals whose assumed adr is far above it (revenue likely optimistic) and credit deals that cashflow at or below the market's typical rate.

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
                {
                  type: "object",
                  required: ["kind", "state"],
                  properties: {
                    kind: { const: "state" },
                    state: {
                      type: "string",
                      description:
                        "2-letter state code for a state-wide search (e.g. 'CA' for 'land in California').",
                    },
                  },
                },
                {
                  type: "object",
                  required: ["kind", "place"],
                  properties: {
                    kind: { const: "near" },
                    place: {
                      type: "string",
                      description:
                        "Vague place or region phrase (e.g. 'East Bay', 'near Tahoe'). Scout expands via aliases.",
                    },
                    radiusMiles: {
                      type: "number",
                      minimum: 1,
                      description: "Approximate search radius in miles (default 30).",
                    },
                    state: {
                      type: "string",
                      description: "Optional 2-letter state hint for expansion.",
                    },
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
          sqftMin: {
            type: "number",
            description:
              "Minimum INTERIOR living area in sqft. NEVER use for land/lot size — use lotSizeMinSqft for that.",
          },
          sqftMax: {
            type: "number",
            description: "Maximum INTERIOR living area in sqft.",
          },
          lotSizeMinSqft: {
            type: "number",
            minimum: 0,
            description:
              "Minimum lot size in SQUARE FEET. Convert acres at 43,560 sqft/acre: '5 acres' is 217800.",
          },
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
          notes: {
            type: "string",
            description:
              "Residual unmappable desire after structured intent fields are filled.",
          },
          intent: {
            type: "object",
            description:
              "Goal-agnostic inference: use case, horizon, household, place tags, capital story, warnings.",
            properties: {
              summary: {
                type: "string",
                description: "One-line restatement of the user's goal.",
              },
              useCase: {
                type: "string",
                enum: [
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
                ],
              },
              horizonYears: {
                type: "number",
                minimum: 0.25,
                maximum: 50,
                description: "Hold / develop / live-then-rent horizon in years.",
              },
              household: {
                type: "object",
                properties: {
                  adults: { type: "integer", minimum: 0 },
                  children: { type: "integer", minimum: 0 },
                  total: { type: "integer", minimum: 1 },
                },
              },
              placeTags: {
                type: "array",
                items: { type: "string" },
                description: "Free-form tags from the prompt (mountain, coastal, urban, …).",
              },
              mustHaves: { type: "array", items: { type: "string" } },
              niceToHaves: { type: "array", items: { type: "string" } },
              inferredMarkets: {
                type: "string",
                description: "Why these markets were chosen or expanded.",
              },
              capitalStory: {
                type: "string",
                description: "How savings / down payment language was interpreted.",
              },
              strategyArc: {
                type: "object",
                required: ["nearTerm"],
                properties: {
                  nearTerm: { type: "string", enum: ["LTR", "STR", "owner"] },
                  later: { type: "string", enum: ["LTR", "STR", "owner"] },
                },
              },
              warnings: {
                type: "array",
                items: { type: "string" },
                description: "Provider, capital, or zoning caveats for the review UI.",
              },
            },
          },
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

export const ADVISE_FINANCING_FIT_SYSTEM = `You are Papuc's financing-fit advisor for US residential investment property.
You receive a structured deal scenario plus a shortlist of already-matched lenders (deterministic filter — do not invent lenders or rates).

Your job:
1. Summarize which financing path fits (DSCR rental, bridge/rehab, hard-money then refi, cash, portfolio).
2. For each matched lender, one sentence on why it was ranked (use the provided fit/caution reasons).
3. Give concrete next steps for buying THIS property (docs to gather, prequal vs hard quote, offer contingencies, LLC vesting if relevant).

Rules:
- Never invent interest rates, points, or approval odds. Say "confirm with the lender".
- This is investor education / directory guidance, not a loan offer or brokerage recommendation.
- Prefer plain language. Max ~6 next-step bullets.
- If DSCR is thin, rehab is large, or down payment is small, say so clearly and point at bridge/hard-money/cash paths when present in the match list.

Use the adviseFinancingFit tool for structured output only.`;

export const ADVISE_FINANCING_FIT_TOOL = {
  name: "adviseFinancingFit",
  description:
    "Return financing-path advice and next steps for a matched lender shortlist.",
  input_schema: {
    type: "object" as const,
    required: ["headline", "pathSummary", "lenderNotes", "nextSteps", "disclaimer"],
    properties: {
      headline: {
        type: "string",
        description: "One short headline for the panel (e.g. Bridge then DSCR refinance).",
      },
      pathSummary: {
        type: "string",
        description: "2–4 sentences on the recommended financing path for this scenario.",
      },
      lenderNotes: {
        type: "array",
        items: {
          type: "object",
          required: ["lenderId", "note"],
          properties: {
            lenderId: { type: "string" },
            note: { type: "string" },
          },
        },
      },
      nextSteps: {
        type: "array",
        items: { type: "string" },
        minItems: 3,
        maxItems: 8,
      },
      disclaimer: {
        type: "string",
        description: "Short compliance disclaimer.",
      },
    },
  },
};

/**
 * Papuc Voice Concierge — short Jack & Jill–style intake call that gathers
 * enough free-form signal for PARSE_PROJECT_SYSTEM to build constraints.
 * Keep turns few; never invent numbers; one question at a time.
 */
export const VOICE_CONCIERGE_SYSTEM = `You are Papuc's Voice Concierge — a warm, careful listener helping someone invent their first (or next) real-estate scout project. You are NOT a mortgage quiz or a form reader.

GOAL
Elicit a natural spoken brief we can later turn into scout filters: where, capital/budget, what they want the property for (live, rent, land, hybrid), and property shape when relevant.

STYLE
- Sound like a sharp friend on a short phone call. Reflect back what you heard in one short phrase before any follow-up.
- Invite a free rant first. After their first answer, ask at most ONE missing high-value question per turn.
- Priority gaps (skip what they already covered): place/market → capital/down or price band → use case (live / long-term rent / Airbnb / land / live-then-rent) → property type or beds when it matters.
- Never invent dollar amounts, cities, or DSCR targets. If unclear, ask or leave it.
- Keep answers short (1–3 sentences). No bullet lists out loud.
- Do NOT call finish_intake in the same turn as a question. Ask, wait for their answer, then continue or finish.
- Call finish_intake only after you have at least two of: place, capital/budget, use — or after a brief confirmation when their first rant already covered all three.
- Cap at ~3 follow-up questions once those signals exist; then say a one-line wrap-up and call finish_intake.

OPENING
Greet in one short line and invite them to rant freely about what they're looking for. Then wait.

TOOLS
- note_progress: when you confidently hear place, budget/capital, or use-case — for UI chips only. Safe to call mid-conversation.
- finish_intake: ONLY when intake is done (see rules above) or the user clearly wants to stop. Never call it right after asking a follow-up. Include a one-sentence summary.`;

/** OpenAI Realtime function tools for the Concierge session. */
export const VOICE_CONCIERGE_TOOLS = [
  {
    type: "function" as const,
    name: "note_progress",
    description:
      "Mark that a high-value intake topic was covered (UI progress chips).",
    parameters: {
      type: "object",
      required: ["topic"],
      properties: {
        topic: {
          type: "string",
          enum: ["place", "budget", "use"],
          description: "place = market/area; budget = capital/price; use = live/rent/land intent",
        },
        label: {
          type: "string",
          description: "Short human label, e.g. Austin TX or $80k down",
        },
      },
    },
  },
  {
    type: "function" as const,
    name: "finish_intake",
    description:
      "End the call only after place + at least one of budget/use are known (or all three from a rich first rant). Never call this in the same turn as asking a question.",
    parameters: {
      type: "object",
      required: ["summary"],
      properties: {
        summary: {
          type: "string",
          description: "One sentence restating their goal in their words.",
        },
      },
    },
  },
];
