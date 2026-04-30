import { describe, expect, it } from "vitest";

import { MockLLMProvider, parseProjectGoals, rankDeals } from "../llm";

describe("MockLLMProvider.parseProjectGoals", () => {
  it("extracts price, down payment, and cashflow target", async () => {
    const llm = new MockLLMProvider();
    const c = await parseProjectGoals(
      llm,
      "I have $200k down payment and want $600/mo cashflow on single family homes in Austin, TX under $500k",
    );
    expect(c.downPayment).toBe(200_000);
    expect(c.priceMax).toBe(500_000);
    expect(c.targetMonthlyCashflow).toBe(600);
    expect(c.markets[0]).toEqual({ kind: "city", city: "Austin", state: "TX" });
    expect(c.strategy).toBe("LTR");
  });

  it("detects STR strategy from Airbnb mention", async () => {
    const llm = new MockLLMProvider();
    const c = await parseProjectGoals(llm, "Looking for an Airbnb in Berkeley, CA");
    expect(c.strategy).toBe("STR");
  });
});

describe("MockLLMProvider.rankDeals", () => {
  it("scores DSCR > 1.25 high and DSCR < 1.0 low", async () => {
    const llm = new MockLLMProvider();
    const constraints = await parseProjectGoals(
      llm,
      "I have $40k down and want $500/mo cashflow",
    );
    const ranked = await rankDeals(llm, {
      userPrompt: "I have $40k down and want $500/mo cashflow",
      constraints,
      deals: [
        {
          dealId: "good",
          address: "1 Good St",
          price: 200000,
          monthlyRent: 2400,
          pitiaTotal: 1500,
          dscr: 1.6,
          cashOnCash: 0.18,
          monthlyCashflow: 700,
          irr5Yr: 0.15,
        },
        {
          dealId: "bad",
          address: "2 Bad Ave",
          price: 500000,
          monthlyRent: 1800,
          pitiaTotal: 2400,
          dscr: 0.75,
          cashOnCash: -0.05,
          monthlyCashflow: -300,
          irr5Yr: null,
        },
      ],
    });
    const good = ranked.find((r) => r.dealId === "good")!;
    const bad = ranked.find((r) => r.dealId === "bad")!;
    expect(good.score).toBeGreaterThan(bad.score);
    expect(good.score).toBeGreaterThanOrEqual(75);
    expect(bad.score).toBeLessThan(50);
    expect(good.rationale).toContain("DSCR");
  });
});
