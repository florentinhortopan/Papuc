import { describe, expect, it } from "vitest";

import {
  DEFAULT_STR_MONTHLY_NIGHTS,
  DEFAULT_STR_MONTHLY_OCCUPANCY,
  defaultStrSchedule,
  estimateSTRAdrFromLTRRent,
  strScheduleFromEstimate,
} from "../proforma";

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

describe("defaultStrSchedule with market intel", () => {
  const rent = 2400; // heuristic ADR = estimateSTRAdrFromLTRRent(2400)
  const heuristicAdr = estimateSTRAdrFromLTRRent(rent);

  it("is unchanged without market intel", () => {
    const s = defaultStrSchedule(rent);
    expect(s.monthlyADR.every((a) => a === heuristicAdr)).toBe(true);
    expect(s.monthlyOccupancy).toEqual(DEFAULT_STR_MONTHLY_OCCUPANCY);
  });

  it("clamps a too-low heuristic ADR up to the market floor", () => {
    const s = defaultStrSchedule(rent, {
      adrLow: heuristicAdr + 50,
      adrHigh: heuristicAdr + 200,
    });
    expect(s.monthlyADR[0]).toBe(heuristicAdr + 50);
  });

  it("clamps a too-high heuristic ADR down to the market ceiling", () => {
    const s = defaultStrSchedule(rent, {
      adrLow: 50,
      adrHigh: heuristicAdr - 30,
    });
    expect(s.monthlyADR[0]).toBe(heuristicAdr - 30);
  });

  it("leaves an in-range heuristic ADR alone", () => {
    const s = defaultStrSchedule(rent, {
      adrLow: heuristicAdr - 20,
      adrHigh: heuristicAdr + 20,
    });
    expect(s.monthlyADR[0]).toBe(heuristicAdr);
  });

  it("falls back to the market median when there is no rent to derive from", () => {
    const s = defaultStrSchedule(0, { adrMedian: 210 });
    expect(s.monthlyADR[0]).toBe(210);
  });

  it("rescales the seasonal occupancy curve so its mean matches the market", () => {
    const s = defaultStrSchedule(rent, { occupancyAvg: 0.5 });
    expect(mean(s.monthlyOccupancy)).toBeCloseTo(0.5, 5);
    // Seasonal shape preserved: peak month still the peak.
    const defaultPeak = DEFAULT_STR_MONTHLY_OCCUPANCY.indexOf(
      Math.max(...DEFAULT_STR_MONTHLY_OCCUPANCY),
    );
    const scaledPeak = s.monthlyOccupancy.indexOf(
      Math.max(...s.monthlyOccupancy),
    );
    expect(scaledPeak).toBe(defaultPeak);
  });

  it("caps the occupancy target so no month exceeds 0.98", () => {
    const s = defaultStrSchedule(rent, { occupancyAvg: 0.99 });
    expect(Math.max(...s.monthlyOccupancy)).toBeLessThanOrEqual(0.98);
    // Target is clamped to 0.95 before rescaling.
    expect(mean(s.monthlyOccupancy)).toBeLessThanOrEqual(0.95);
  });

  it("floors an implausibly low reported occupancy at 0.2", () => {
    const s = defaultStrSchedule(rent, { occupancyAvg: 0.05 });
    expect(mean(s.monthlyOccupancy)).toBeCloseTo(0.2, 5);
  });
});

describe("strScheduleFromEstimate", () => {
  it("uses flat ADR and flat occupancy when there is no distribution", () => {
    const s = strScheduleFromEstimate({ adr: 250, occupancy: 0.62 });
    expect(s.monthlyADR).toEqual(new Array(12).fill(250));
    expect(s.monthlyOccupancy).toEqual(new Array(12).fill(0.62));
  });

  it("derives a seasonal occupancy curve from the revenue distribution", () => {
    // Summer-heavy: months 5-8 carry 60% of revenue.
    const dist = [
      0.04, 0.04, 0.05, 0.06, 0.08, 0.15, 0.18, 0.15, 0.12, 0.06, 0.04, 0.03,
    ];
    // 0.40 annual occupancy keeps every derived month under the 0.98 cap
    // so the peak-month and total-nights assertions hold exactly.
    const s = strScheduleFromEstimate({
      adr: 200,
      occupancy: 0.4,
      monthlyRevenueDistribution: dist,
    });
    // July (index 6, largest share) must be the peak occupancy month.
    expect(s.monthlyOccupancy.indexOf(Math.max(...s.monthlyOccupancy))).toBe(6);
    // Total rented nights should reproduce 365 * occupancy.
    const rentedNights = s.monthlyOccupancy.reduce(
      (sum, occ, m) => sum + occ * DEFAULT_STR_MONTHLY_NIGHTS[m]!,
      0,
    );
    expect(rentedNights).toBeCloseTo(365 * 0.4, 1);
  });

  it("caps derived monthly occupancy at 0.98", () => {
    // Pathological: all revenue in one month.
    const dist = [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    const s = strScheduleFromEstimate({
      adr: 300,
      occupancy: 0.5,
      monthlyRevenueDistribution: dist,
    });
    expect(Math.max(...s.monthlyOccupancy)).toBeLessThanOrEqual(0.98);
  });

  it("ignores malformed distributions (wrong length, negatives, all zeros)", () => {
    for (const dist of [[0.5, 0.5], new Array(12).fill(0), [-1, ...new Array(11).fill(0.1)]]) {
      const s = strScheduleFromEstimate({
        adr: 180,
        occupancy: 0.6,
        monthlyRevenueDistribution: dist as number[],
      });
      expect(s.monthlyOccupancy).toEqual(new Array(12).fill(0.6));
    }
  });
});
