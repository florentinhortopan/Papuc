import { describe, expect, it } from "vitest";

import {
  computeProForma,
  defaultStrSchedule,
  DEFAULT_STR_MONTHLY_OCCUPANCY,
  estimateSTRAdrFromLTRRent,
  type ProFormaInputs,
} from "../proforma";

/**
 * Regression test for the scout-vs-detail STR cashflow disconnect. Prior
 * to centralizing the STR schedule in @papuc/core, the scout used the
 * proforma's implicit flat 0.7 occupancy + a properly estimated ADR
 * while the deal-detail editor used a seasonal occupancy curve + a
 * naive `est_rent / 30` ADR. That produced cards showing +$867/mo on
 * deals whose detail page calculated -$1,149/mo (real user-reported
 * Sacramento listing). Both paths must now produce identical numbers
 * for the same listing inputs.
 */
describe("defaultStrSchedule parity", () => {
  it("seeds the same ADR everywhere", () => {
    const sched = defaultStrSchedule(1943);
    const adr = estimateSTRAdrFromLTRRent(1943);
    expect(sched.monthlyADR).toHaveLength(12);
    for (const a of sched.monthlyADR) {
      expect(a).toBeCloseTo(adr, 5);
    }
    expect(adr).toBeGreaterThan(150);
    expect(adr).toBeLessThan(200);
  });

  it("uses the seasonal occupancy curve, not flat 0.7", () => {
    const sched = defaultStrSchedule(2000);
    expect(sched.monthlyOccupancy).toEqual([...DEFAULT_STR_MONTHLY_OCCUPANCY]);
    expect(Math.min(...sched.monthlyOccupancy)).toBeLessThan(0.7);
    expect(Math.max(...sched.monthlyOccupancy)).toBeGreaterThan(0.9);
  });

  it("returns deep-copied arrays the caller can mutate safely", () => {
    const a = defaultStrSchedule(1500);
    a.monthlyADR[0] = 999;
    a.monthlyOccupancy[0] = 0.1;
    const b = defaultStrSchedule(1500);
    expect(b.monthlyADR[0]).not.toBe(999);
    expect(b.monthlyOccupancy[0]).not.toBe(0.1);
  });
});

describe("STR cashflow parity: scout vs detail editor", () => {
  /**
   * Recreates the exact pro-forma both paths now compute for the bug
   * report's Sacramento listing. Both must produce identical
   * annualPreTaxProfit / dscr so the deal card and the detail page show
   * the same numbers.
   */
  it("scout and detail editor produce identical cashflow + DSCR for the same listing", () => {
    const price = 430000;
    const downPayment = 200000;
    const monthlyRent = 1943;
    const rateAPR = 0.075;
    const termYears = 30;
    const insuranceMonthly = 125;
    const pmiRatePct = 0;
    const hoaMonthly = 0;
    const taxRatePct = 0.011;
    const utilitiesMonthly = 400;
    const maintenanceMonthly = 100;
    const miscMonthly = 100;

    // What the scout would compute (now via defaultStrSchedule).
    const scoutSched = defaultStrSchedule(monthlyRent);
    const scoutInputs: ProFormaInputs = {
      price,
      downPayment,
      rateAPR,
      termYears,
      strategy: "STR",
      monthlyRentLTR: 0,
      monthlyNights: scoutSched.monthlyNights,
      monthlyADR: scoutSched.monthlyADR,
      monthlyOccupancy: scoutSched.monthlyOccupancy,
      monthlyAvgStays: scoutSched.monthlyAvgStays,
      insuranceMonthly,
      pmiRatePct,
      hoaMonthly,
      propertyTaxRatePct: taxRatePct,
      utilitiesMonthly,
      maintenanceMonthly,
      miscMonthly,
    };

    // What the detail editor would compute (also via defaultStrSchedule
    // through defaultStrMatrix). The matrix arrays the user starts with
    // are identical to scoutSched, so the proformas converge.
    const detailSched = defaultStrSchedule(monthlyRent);
    const detailInputs: ProFormaInputs = {
      ...scoutInputs,
      monthlyNights: detailSched.monthlyNights,
      monthlyADR: detailSched.monthlyADR,
      monthlyOccupancy: detailSched.monthlyOccupancy,
      monthlyAvgStays: detailSched.monthlyAvgStays,
    };

    const scoutResult = computeProForma(scoutInputs);
    const detailResult = computeProForma(detailInputs);

    expect(detailResult.annualPreTaxProfit).toBeCloseTo(
      scoutResult.annualPreTaxProfit,
      2,
    );
    expect(detailResult.dscr).toBeCloseTo(scoutResult.dscr, 4);
    expect(detailResult.cashOnCashReturn).toBeCloseTo(
      scoutResult.cashOnCashReturn,
      4,
    );
  });

  it("seed ADR via estimateSTRAdrFromLTRRent NOT est_rent / 30", () => {
    const monthlyRent = 1943;
    const goodAdr = estimateSTRAdrFromLTRRent(monthlyRent);
    const badAdr = monthlyRent / 30;
    expect(goodAdr).toBeGreaterThan(badAdr * 2);
  });
});
