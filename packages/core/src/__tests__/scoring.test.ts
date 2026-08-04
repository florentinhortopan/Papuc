import { describe, expect, it } from "vitest";

import {
  computeBaseScore,
  computeBatchContext,
  scoreAsset,
  scoreFinance,
  scoreLandFinance,
  scoreOpportunity,
  type ScoreSignals,
} from "../scoring";

const NOW = Date.parse("2026-07-29T00:00:00.000Z");
const DAY = 86_400_000;

const solidFinance = {
  dscr: 1.3,
  monthlyCashflow: 500,
  targetCashflow: 0,
  cashOnCash: 0.12,
};

describe("scoreFinance", () => {
  it("tiers DSCR and clamps into 0..60", () => {
    expect(scoreFinance(solidFinance)).toBe(54); // 30 + 20 + 4
    expect(
      scoreFinance({ dscr: 1.15, monthlyCashflow: 0, targetCashflow: 0, cashOnCash: 0.05 }),
    ).toBe(42); // 30 + 12
    expect(
      scoreFinance({ dscr: 1.02, monthlyCashflow: 0, targetCashflow: 0, cashOnCash: 0.05 }),
    ).toBe(34); // 30 + 4
    expect(
      scoreFinance({ dscr: 0.8, monthlyCashflow: -900, targetCashflow: 0, cashOnCash: -0.05 }),
    ).toBe(0); // 30 - 25 - 8 → clamped
  });

  it("rewards hitting the cashflow target and punishes missing it", () => {
    const base = { dscr: 1.3, cashOnCash: 0.05 };
    expect(scoreFinance({ ...base, monthlyCashflow: 600, targetCashflow: 500 })).toBe(60); // 30+20+12 = 62, capped at 60
    expect(scoreFinance({ ...base, monthlyCashflow: 400, targetCashflow: 500 })).toBe(53); // 30+20+3
    expect(scoreFinance({ ...base, monthlyCashflow: 100, targetCashflow: 500 })).toBe(40); // 30+20-10
  });
});

describe("scoreOpportunity", () => {
  it("scales the price-cut bonus by percent of price", () => {
    const big: ScoreSignals = { price: 500000, priceChange: -30000 }; // 6%
    const mid: ScoreSignals = { price: 500000, priceChange: -15000 }; // 3%
    const small: ScoreSignals = { price: 500000, priceChange: -2000 }; // 0.4%
    expect(scoreOpportunity(big, NOW)).toBe(12);
    expect(scoreOpportunity(mid, NOW)).toBe(7);
    expect(scoreOpportunity(small, NOW)).toBe(3);
  });

  it("ignores price increases", () => {
    expect(scoreOpportunity({ price: 500000, priceChange: 10000 }, NOW)).toBe(0);
  });

  it("adds the recency bonus only for cuts within 14 days", () => {
    const recent: ScoreSignals = {
      price: 500000,
      priceChange: -30000,
      priceChangedAt: new Date(NOW - 5 * DAY).toISOString(),
    };
    const old: ScoreSignals = {
      price: 500000,
      priceChange: -30000,
      priceChangedAt: new Date(NOW - 60 * DAY).toISOString(),
    };
    expect(scoreOpportunity(recent, NOW)).toBe(16); // 12 + 4
    expect(scoreOpportunity(old, NOW)).toBe(12);
  });

  it("tiers freshness and never penalizes stale listings", () => {
    expect(scoreOpportunity({ daysOnMarket: 3 }, NOW)).toBe(9);
    expect(scoreOpportunity({ daysOnMarket: 20 }, NOW)).toBe(5);
    expect(scoreOpportunity({ daysOnMarket: 60 }, NOW)).toBe(2);
    expect(scoreOpportunity({ daysOnMarket: 400 }, NOW)).toBe(0);
  });

  it("caps the bucket at 25", () => {
    const maxed: ScoreSignals = {
      price: 500000,
      priceChange: -50000,
      priceChangedAt: new Date(NOW - 2 * DAY).toISOString(),
      daysOnMarket: 2,
    };
    expect(scoreOpportunity(maxed, NOW)).toBe(25); // 12+4+9 exactly
  });

  it("returns 0 for missing signals", () => {
    expect(scoreOpportunity(undefined, NOW)).toBe(0);
    expect(scoreOpportunity({}, NOW)).toBe(0);
  });
});

describe("scoreAsset", () => {
  const batch = {
    medianSqft: 1500,
    topQuartileSqft: 2000,
    medianLotSqft: 8000,
    topQuartileLotSqft: 20000,
  };

  it("rewards top-quartile and above-median sqft", () => {
    expect(scoreAsset({ sqft: 2200 }, batch)).toBe(8);
    expect(scoreAsset({ sqft: 1700 }, batch)).toBe(5);
    expect(scoreAsset({ sqft: 1200 }, batch)).toBe(0);
  });

  it("falls back to lot size when interior sqft is missing (land)", () => {
    expect(scoreAsset({ lotSizeSqft: 43560 }, batch)).toBe(8);
    expect(scoreAsset({ lotSizeSqft: 10000 }, batch)).toBe(5);
  });

  it("scores HOA: none +5, heavy −5, unknown neutral", () => {
    expect(scoreAsset({ hoaMonthly: 0 }, batch)).toBe(5);
    expect(scoreAsset({ hoaMonthly: 300 }, batch)).toBe(-5);
    expect(scoreAsset({ hoaMonthly: 100 }, batch)).toBe(0);
    expect(scoreAsset({}, batch)).toBe(0);
  });

  it("adds the rich-media bonus for ≥10 photos or a tour", () => {
    expect(scoreAsset({ photoCount: 12 }, batch)).toBe(2);
    expect(scoreAsset({ photoCount: 3, hasVirtualTour: true }, batch)).toBe(2);
    expect(scoreAsset({ photoCount: 3 }, batch)).toBe(0);
  });

  it("clamps to [-5, 15]", () => {
    expect(
      scoreAsset({ sqft: 2500, hoaMonthly: 0, photoCount: 20 }, batch),
    ).toBe(15); // 8+5+2 exactly at the cap
    expect(scoreAsset({ hoaMonthly: 999 }, batch)).toBe(-5);
  });
});

describe("computeBaseScore", () => {
  it("sums the buckets and returns the breakdown", () => {
    const { score, components } = computeBaseScore({
      ...solidFinance,
      signals: {
        price: 500000,
        priceChange: -30000,
        priceChangedAt: new Date(NOW - 3 * DAY).toISOString(),
        daysOnMarket: 5,
        sqft: 2200,
        hoaMonthly: 0,
        photoCount: 15,
      },
      batch: { medianSqft: 1500, topQuartileSqft: 2000 },
      now: NOW,
    });
    expect(components.finance).toBe(54);
    expect(components.opportunity).toBe(25);
    expect(components.asset).toBe(15);
    expect(score).toBe(94);
  });

  it("stays purely financial when no signals are provided", () => {
    const { score, components } = computeBaseScore({ ...solidFinance, now: NOW });
    expect(components.opportunity).toBe(0);
    expect(components.asset).toBe(0);
    expect(score).toBe(components.finance);
  });

  it("clamps the total to 0..100", () => {
    const { score } = computeBaseScore({
      dscr: 0.5,
      monthlyCashflow: -2000,
      targetCashflow: 1000,
      cashOnCash: -0.2,
      signals: { hoaMonthly: 500 },
      now: NOW,
    });
    expect(score).toBe(0);
  });
});

describe("computeBatchContext", () => {
  it("computes median and top-quartile sqft over the batch", () => {
    const ctx = computeBatchContext([
      { sqft: 1000 },
      { sqft: 1500 },
      { sqft: 2000 },
      { sqft: 2500 },
      { sqft: 3000 },
    ]);
    expect(ctx.medianSqft).toBe(2000);
    expect(ctx.topQuartileSqft).toBe(2500);
  });

  it("keeps lot percentiles separate and skips missing values", () => {
    const ctx = computeBatchContext([
      { sqft: 1200, lotSizeSqft: 5000 },
      { lotSizeSqft: 10000 },
      { sqft: 1800 },
      { sqft: 0 }, // non-positive is ignored
    ]);
    expect(ctx.medianSqft).toBe(1500);
    expect(ctx.medianLotSqft).toBe(7500);
  });

  it("returns undefined percentiles for an empty batch", () => {
    const ctx = computeBatchContext([]);
    expect(ctx.medianSqft).toBeUndefined();
    expect(ctx.medianLotSqft).toBeUndefined();
    expect(ctx.medianPricePerLotSqft).toBeUndefined();
  });
});

describe("land scoring", () => {
  // Four 1-acre parcels at $1, $2, $3, $4 per lot-sqft.
  const batch = computeBatchContext([
    { lotSizeSqft: 43_560, price: 43_560 },
    { lotSizeSqft: 43_560, price: 87_120 },
    { lotSizeSqft: 43_560, price: 130_680 },
    { lotSizeSqft: 43_560, price: 174_240 },
  ]);

  it("computes price-per-lot-sqft percentiles", () => {
    expect(batch.medianPricePerLotSqft).toBeCloseTo(2.5);
    expect(batch.bottomQuartilePricePerLotSqft).toBeCloseTo(1.75);
  });

  it("rewards cheap dirt and stays neutral without data", () => {
    // At/below the batch's cheap quartile.
    expect(
      scoreLandFinance({ price: 43_560, lotSizeSqft: 43_560 }, batch),
    ).toBe(55);
    // Below median but above the cheap quartile.
    expect(
      scoreLandFinance({ price: 87_120, lotSizeSqft: 43_560 }, batch),
    ).toBe(42);
    // Above median: neutral.
    expect(
      scoreLandFinance({ price: 174_240, lotSizeSqft: 43_560 }, batch),
    ).toBe(30);
    // Missing signals or lot size: neutral.
    expect(scoreLandFinance(undefined, batch)).toBe(30);
    expect(scoreLandFinance({ price: 100_000 }, batch)).toBe(30);
  });

  it("computeBaseScore in land mode swaps the DSCR tiers for the land bucket", () => {
    const common = {
      dscr: 0,
      monthlyCashflow: -450, // carrying cost — normal for vacant land
      targetCashflow: 0,
      cashOnCash: -0.05,
      signals: { price: 43_560, lotSizeSqft: 43_560 } as ScoreSignals,
      batch,
      now: NOW,
    };
    const land = computeBaseScore({ ...common, assetClass: "land" });
    const rental = computeBaseScore(common);
    expect(land.components.finance).toBe(55);
    // The same numbers scored as a rental crater on the DSCR tier.
    expect(rental.components.finance).toBeLessThan(land.components.finance);
    expect(land.score).toBeGreaterThan(rental.score);
  });
});
