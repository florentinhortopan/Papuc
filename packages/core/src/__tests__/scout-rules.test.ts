import { describe, expect, it } from "vitest";

import {
  estimateScoutCredits,
  listScoutRuleCostRows,
  resolveEffectiveDaysOnZillow,
  resolveScoutRule,
  SCOUT_RULES,
  tighterRecency,
} from "../scout-rules";

describe("scout-rules.json policy", () => {
  it("loads versioned tiers for free and pro", () => {
    expect(SCOUT_RULES.version).toBe(1);
    expect(SCOUT_RULES.tiers.free.manual.enabled).toBe(true);
    expect(SCOUT_RULES.tiers.free.scheduled.enabled).toBe(false);
    expect(SCOUT_RULES.tiers.pro.scheduled.enabled).toBe(true);
  });

  it("forces recent inventory on both manual and scheduled discovery", () => {
    expect(resolveScoutRule("free", "manual").daysOnZillow).toBe("7d");
    expect(resolveScoutRule("pro", "manual").daysOnZillow).toBe("7d");
    expect(resolveScoutRule("pro", "scheduled").daysOnZillow).toBe("24h");
  });

  it("keeps nightly Pro cheap (1 page) vs deeper manual Pro", () => {
    const nightly = resolveScoutRule("pro", "scheduled");
    const manual = resolveScoutRule("pro", "manual");
    expect(nightly.maxPages).toBe(1);
    expect(manual.maxPages).toBeGreaterThan(nightly.maxPages);
  });
});

describe("resolveEffectiveDaysOnZillow", () => {
  it("applies the rule ceiling when the project has no preference", () => {
    expect(resolveEffectiveDaysOnZillow(undefined, "7d")).toBe("7d");
  });

  it("keeps a tighter project preference", () => {
    expect(resolveEffectiveDaysOnZillow("24h", "7d")).toBe("24h");
  });

  it("clamps a looser project preference to the rule", () => {
    expect(resolveEffectiveDaysOnZillow("90d", "7d")).toBe("7d");
  });
});

describe("tighterRecency", () => {
  it("orders Zillow tokens by duration", () => {
    expect(tighterRecency("24h", "7d")).toBe("24h");
    expect(tighterRecency("30d", "7d")).toBe("7d");
  });
});

describe("estimateScoutCredits", () => {
  it("prices Pro nightly at one listing page", () => {
    const cost = estimateScoutCredits(resolveScoutRule("pro", "scheduled"));
    expect(cost.listingPages).toBe(1);
    expect(cost.listingCredits).toBe(
      SCOUT_RULES.providerCredits.hasdata.zillowListingPage,
    );
    expect(cost.estimatedUsd).toBeCloseTo(
      cost.listingCredits * SCOUT_RULES.costModel.usdPerHasDataCredit,
      6,
    );
  });

  it("prices Pro manual at up to three listing pages", () => {
    const cost = estimateScoutCredits(resolveScoutRule("pro", "manual"));
    expect(cost.listingPages).toBe(3);
    expect(cost.listingCredits).toBe(15);
  });

  it("exposes a flat cost table for pricing reviews", () => {
    const rows = listScoutRuleCostRows();
    expect(rows).toHaveLength(4);
    expect(rows.every((r) => typeof r.listingCredits === "number")).toBe(true);
  });
});
