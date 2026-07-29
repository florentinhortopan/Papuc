import { describe, expect, it } from "vitest";

import { normalizeStrMarketIntel } from "../llm/claude";
import { RECORD_STR_MARKET_INTEL_TOOL } from "../llm/prompts";
import {
  STR_INTEL_TTL_DAYS,
  isStrIntelFresh,
  strIntelExpiresAt,
  strIntelMarketKey,
} from "../str-intel-cache";

describe("RECORD_STR_MARKET_INTEL_TOOL schema", () => {
  it("keeps the tool schema and the normalized output shape in sync", () => {
    const props = RECORD_STR_MARKET_INTEL_TOOL.input_schema.properties as Record<
      string,
      unknown
    >;
    // Every field the normalizer emits must be declared in the tool schema,
    // otherwise Claude can never populate it.
    for (const field of [
      "adrLow",
      "adrMedian",
      "adrHigh",
      "occupancyAvg",
      "seasonalityNotes",
      "regulationStatus",
      "regulationSummary",
      "permitRequired",
      "resourceLinks",
      "sources",
    ]) {
      expect(props, `schema missing ${field}`).toHaveProperty(field);
    }
    expect(RECORD_STR_MARKET_INTEL_TOOL.input_schema.required).toContain(
      "regulationStatus",
    );
    expect(
      (props.regulationStatus as { enum: string[] }).enum.sort(),
    ).toEqual(["banned", "permitted", "restricted", "unclear"]);
  });
});

describe("normalizeStrMarketIntel", () => {
  it("passes through a well-formed payload", () => {
    const intel = normalizeStrMarketIntel({
      adrLow: 150,
      adrMedian: 210,
      adrHigh: 320,
      occupancyAvg: 0.58,
      seasonalityNotes: "Summer lake season peaks June-August.",
      regulationStatus: "restricted",
      regulationSummary: "Permit required, 120-night annual cap.",
      permitRequired: true,
      resourceLinks: [
        { title: "County STR permits", url: "https://county.gov/str" },
      ],
      sources: ["https://airdna.co/market"],
    });
    expect(intel.adrLow).toBe(150);
    expect(intel.adrMedian).toBe(210);
    expect(intel.adrHigh).toBe(320);
    expect(intel.occupancyAvg).toBeCloseTo(0.58);
    expect(intel.regulationStatus).toBe("restricted");
    expect(intel.permitRequired).toBe(true);
    expect(intel.resourceLinks).toHaveLength(1);
    expect(intel.sources).toHaveLength(1);
  });

  it("repairs percent-form occupancy and swaps an inverted ADR range", () => {
    const intel = normalizeStrMarketIntel({
      adrLow: 300,
      adrHigh: 150,
      occupancyAvg: 58,
      regulationStatus: "permitted",
      resourceLinks: [],
      sources: [],
    });
    expect(intel.adrLow).toBe(150);
    expect(intel.adrHigh).toBe(300);
    expect(intel.occupancyAvg).toBeCloseTo(0.58);
  });

  it("clamps the median into the low/high range", () => {
    const intel = normalizeStrMarketIntel({
      adrLow: 100,
      adrMedian: 500,
      adrHigh: 300,
      regulationStatus: "permitted",
      resourceLinks: [],
      sources: [],
    });
    expect(intel.adrMedian).toBe(300);
  });

  it("drops implausible ADRs, bad links, and unknown statuses", () => {
    const intel = normalizeStrMarketIntel({
      adrLow: -5,
      adrMedian: 99999,
      adrHigh: 3,
      occupancyAvg: -0.2,
      regulationStatus: "sort-of-legal",
      resourceLinks: [
        { title: "ok", url: "https://city.gov/str" },
        { title: "javascript", url: "javascript:alert(1)" },
        { url: "https://missing-title.gov" },
      ],
      sources: ["https://good.example", "not-a-url", 42],
    });
    expect(intel.adrLow).toBeUndefined();
    expect(intel.adrMedian).toBeUndefined();
    expect(intel.adrHigh).toBeUndefined();
    expect(intel.occupancyAvg).toBeUndefined();
    expect(intel.regulationStatus).toBe("unclear");
    expect(intel.resourceLinks).toEqual([
      { title: "ok", url: "https://city.gov/str" },
    ]);
    expect(intel.sources).toEqual(["https://good.example"]);
  });

  it("tolerates garbage input entirely", () => {
    const intel = normalizeStrMarketIntel(null);
    expect(intel.regulationStatus).toBe("unclear");
    expect(intel.resourceLinks).toEqual([]);
    expect(intel.sources).toEqual([]);
  });
});

describe("str intel cache policy", () => {
  it("normalizes the market key", () => {
    expect(strIntelMarketKey("  Clearlake Oaks ", " CA ")).toBe(
      "clearlake oaks, ca",
    );
  });

  it("computes expiry TTL_DAYS ahead of the research date", () => {
    const researched = new Date("2026-07-29T00:00:00Z");
    const expires = new Date(strIntelExpiresAt(researched));
    const days = (expires.getTime() - researched.getTime()) / 86_400_000;
    expect(days).toBe(STR_INTEL_TTL_DAYS);
  });

  it("fresh rows skip re-research; expired rows trigger it", () => {
    const now = new Date("2026-07-29T12:00:00Z");
    expect(isStrIntelFresh("2026-08-01T00:00:00Z", now)).toBe(true);
    expect(isStrIntelFresh("2026-07-01T00:00:00Z", now)).toBe(false);
    // Exactly-now counts as expired (strictly-greater comparison).
    expect(isStrIntelFresh(now.toISOString(), now)).toBe(false);
    expect(isStrIntelFresh("garbage", now)).toBe(false);
  });
});
