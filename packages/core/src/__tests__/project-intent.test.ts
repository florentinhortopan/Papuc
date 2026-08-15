import { describe, expect, it } from "vitest";

import {
  ProjectConstraintsSchema,
  ProjectIntentSchema,
  PROJECT_USE_CASE_LABELS,
  expandMarketsForScout,
  lookupRegionAlias,
  type ProjectUseCase,
} from "../index";
import { MockLLMProvider, parseProjectGoals } from "../llm";
import { PARSE_PROJECT_TOOL } from "../llm/prompts";

describe("ProjectIntent schema", () => {
  const useCases: ProjectUseCase[] = [
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
  ];

  it("labels cover every use case", () => {
    for (const u of useCases) {
      expect(PROJECT_USE_CASE_LABELS[u]).toBeTruthy();
    }
  });

  it("accepts a full intent object nested under constraints", () => {
    const ok = ProjectConstraintsSchema.safeParse({
      markets: [{ kind: "city", city: "Oakland", state: "CA" }],
      mortgage: { rateAPR: 0.075, termYears: 30, ltv: 0.75 },
      propertyTypes: ["mixed_use"],
      strategy: "LTR",
      intent: {
        summary: "Cafe downstairs with living upstairs in the East Bay",
        useCase: "live_work",
        placeTags: ["east_bay", "walkable"],
        mustHaves: ["storefront"],
        inferredMarkets: "Expanded East Bay to Oakland/Berkeley",
        capitalStory: "Interpreted $80k savings as totalCash",
        warnings: ["Needs RealEstateAPI for mixed_use"],
      },
    });
    expect(ok.success).toBe(true);
  });

  it("accepts near markets and strategyArc", () => {
    const ok = ProjectConstraintsSchema.safeParse({
      markets: [
        { kind: "near", place: "East Bay", radiusMiles: 30, state: "CA" },
      ],
      mortgage: { rateAPR: 0.075, termYears: 30, ltv: 0.9 },
      intent: {
        useCase: "owner_occupy_then_str",
        horizonYears: 3,
        household: { total: 4 },
        strategyArc: { nearTerm: "owner", later: "STR" },
      },
    });
    expect(ok.success).toBe(true);
  });

  it("rejects invalid useCase", () => {
    const bad = ProjectIntentSchema.safeParse({ useCase: "surf_shack" });
    expect(bad.success).toBe(false);
  });

  it("exposes intent + near in the Claude tool schema", () => {
    const constraints = PARSE_PROJECT_TOOL.input_schema.properties
      .constraints as {
      properties: {
        markets: {
          items: { oneOf: Array<{ properties: { kind: { const: string } } }> };
        };
        intent?: { type?: string; properties?: Record<string, unknown> };
      };
    };
    const kinds = constraints.properties.markets.items.oneOf.map(
      (v) => v.properties.kind.const,
    );
    expect(kinds).toContain("near");
    expect(constraints.properties.intent?.type).toBe("object");
    expect(constraints.properties.intent?.properties?.useCase).toBeTruthy();
  });
});

describe("Region aliases + expandMarketsForScout", () => {
  it("looks up East Bay cities", () => {
    const cities = lookupRegionAlias("East Bay");
    expect(cities?.some((c) => c.city === "Oakland")).toBe(true);
  });

  it("expands near markets into concrete cities", () => {
    const expanded = expandMarketsForScout([
      { kind: "near", place: "East Bay", radiusMiles: 30, state: "CA" },
    ]);
    expect(expanded.length).toBeGreaterThan(1);
    expect(expanded.every((m) => m.kind === "city")).toBe(true);
    expect(expanded.length).toBeLessThanOrEqual(5);
  });

  it("dedupes and caps multi-city lists", () => {
    const expanded = expandMarketsForScout(
      [
        { kind: "city", city: "Oakland", state: "CA" },
        { kind: "near", place: "East Bay", radiusMiles: 25, state: "CA" },
        { kind: "city", city: "Austin", state: "TX" },
      ],
      5,
    );
    const keys = expanded.map((m) =>
      m.kind === "city" ? `${m.city},${m.state}` : m.kind,
    );
    expect(new Set(keys).size).toBe(keys.length);
    expect(expanded.length).toBeLessThanOrEqual(5);
  });
});

describe("MockLLMProvider broad-intent golden prompts", () => {
  const llm = new MockLLMProvider();

  it("1. classic rental cashflow", async () => {
    const c = await parseProjectGoals(
      llm,
      "I have $200k down and want $600/mo cashflow on single family homes in Austin, TX under $500k",
    );
    expect(c.strategy).toBe("LTR");
    expect(c.intent?.useCase).toBe("rental_income");
    expect(c.downPayment).toBe(200_000);
    expect(c.priceMax).toBe(500_000);
    expect(c.markets[0]).toEqual({ kind: "city", city: "Austin", state: "TX" });
  });

  it("2. vague place + lifestyle second home", async () => {
    const c = await parseProjectGoals(
      llm,
      "Looking for a mountain retreat weekend home near Tahoe under $800k",
    );
    expect(c.intent?.useCase).toBe("lifestyle_second_home");
    expect(c.intent?.placeTags).toContain("mountain");
    expect(c.markets.length).toBeGreaterThanOrEqual(1);
  });

  it("3. live-work / commercial ops", async () => {
    const c = await parseProjectGoals(
      llm,
      "Want a cafe with living upstairs in the East Bay — mixed-use storefront",
    );
    expect(c.propertyTypes).toContain("mixed_use");
    expect(c.intent?.useCase).toBe("live_work");
    expect(c.intent?.warnings?.length).toBeGreaterThan(0);
    expect(c.markets.length).toBeGreaterThan(1);
  });

  it("4. land develop with multi-year horizon", async () => {
    const c = await parseProjectGoals(
      llm,
      "Buy land in California to develop in 5 years",
    );
    expect(c.propertyTypes).toEqual(["land"]);
    expect(c.intent?.useCase).toBe("land_develop");
    expect(c.intent?.horizonYears).toBe(5);
    expect(c.markets[0]?.kind).toBe("state");
  });

  it("5. owner-occupy then Airbnb with family size → beds", async () => {
    const c = await parseProjectGoals(
      llm,
      "Family of 4 wants to live a few years in Truckee, CA then Airbnb later",
    );
    expect(c.intent?.useCase).toBe("owner_occupy_then_str");
    expect(c.strategy).toBe("LTR");
    expect(c.intent?.strategyArc).toEqual({
      nearTerm: "owner",
      later: "STR",
    });
    expect(c.intent?.household?.total).toBe(4);
    expect(c.bedsMin).toBeGreaterThanOrEqual(3);
  });
});
