import { describe, expect, it } from "vitest";

import {
  computeBreakevenADR,
  computeIRR,
  computeProForma,
  estimateSTRAdrFromLTRRent,
} from "../proforma";
import { computeDSCR, computeMonthlyPI, computePITIA } from "../dscr";

import berkeley from "./fixtures/berkeley.json";

type SheetFixture = {
  purchase_price: number;
  down_payment: number;
  improvements: number;
  tax_rate: number;
  equity_5yr: number;
  mortgage_payment: number;
  taxes_monthly: number;
  pmi_monthly: number;
  utilities: number;
  maintenance: number;
  insurance: number;
  misc: number;
  total_monthly_payment: number;
  mgmt_fee: number;
  cleaning_cost: number;
  booking_fee: number;
  supply_cost: number;
  cleaning_revenue: number;
  monthly_nights: number[];
  monthly_adr: number[];
  monthly_occ: number[];
  monthly_stays: number[];
  monthly_revenue: number[];
  monthly_variable: number[];
  monthly_contributions: number[];
  monthly_fixed: number[];
  monthly_pretax: number[];
  initial_sunk: number;
  annual_pretax: number;
  annual_aftertax: number;
  payout_years: number;
  cash_on_cash: number;
  equity_multiple_5yr: number;
  total_yearly_payment: number;
  strategy: "STR" | "LTR";
};

const fixtures = berkeley as Record<string, SheetFixture>;

function near(actual: number, expected: number, tol = 0.005, hint?: string) {
  const eps = Math.max(Math.abs(expected) * tol, 0.5);
  const diff = Math.abs(actual - expected);
  if (diff > eps) {
    throw new Error(
      `expected ${actual} to be near ${expected} (diff ${diff} > tol ${eps})${hint ? ` [${hint}]` : ""}`,
    );
  }
}

function runSheet(sheet: SheetFixture) {
  return computeProForma({
    price: sheet.purchase_price,
    downPayment: sheet.down_payment,
    improvements: sheet.improvements,
    taxRate: sheet.tax_rate,
    equityGained5Yr: sheet.equity_5yr,
    monthlyPIOverride: sheet.mortgage_payment,
    taxesMonthlyOverride: sheet.taxes_monthly,
    pmiMonthlyOverride: sheet.pmi_monthly,
    insuranceMonthly: sheet.insurance,
    utilitiesMonthly: sheet.utilities,
    maintenanceMonthly: sheet.maintenance,
    miscMonthly: sheet.misc,
    yearlyTaxesAndOther: sheet.total_yearly_payment,
    strategy: sheet.strategy,
    managementFeeRate: sheet.mgmt_fee,
    cleaningCostPerStay: sheet.cleaning_cost,
    cleaningRevenuePerStay: sheet.cleaning_revenue,
    bookingFeeRate: sheet.booking_fee,
    supplyCostPerStay: sheet.supply_cost,
    monthlyNights: sheet.monthly_nights,
    monthlyADR: sheet.monthly_adr,
    monthlyOccupancy: sheet.monthly_occ,
    monthlyAvgStays: sheet.monthly_stays,
  });
}

describe("Berkeley.xlsx parity", () => {
  for (const sheetName of Object.keys(fixtures)) {
    const sheet = fixtures[sheetName]!;
    it(`matches sheet "${sheetName}" pro-forma values within 0.5%`, () => {
      const result = runSheet(sheet);

      near(result.initialSunkInvestment, sheet.initial_sunk, 0.005, "initial_sunk");
      near(result.annualPreTaxProfit, sheet.annual_pretax, 0.005, "annual_pretax");
      near(result.annualPostTaxProfit, sheet.annual_aftertax, 0.005, "annual_aftertax");
      near(result.cashOnCashReturn, sheet.cash_on_cash, 0.005, "cash_on_cash");
      near(result.payoutYears, sheet.payout_years, 0.01, "payout_years");
      near(
        result.equityMultiple5Yr,
        sheet.equity_multiple_5yr,
        0.01,
        "equity_multiple_5yr",
      );

      for (let m = 0; m < 12; m++) {
        near(result.monthlyRevenue[m]!, sheet.monthly_revenue[m]!, 0.005, `revenue m${m}`);
        near(
          result.monthlyVariableCosts[m]!,
          sheet.monthly_variable[m]!,
          0.005,
          `variable m${m}`,
        );
        near(
          result.monthlyContributions[m]!,
          sheet.monthly_contributions[m]!,
          0.005,
          `contrib m${m}`,
        );
        near(
          result.monthlyFixedCosts[m]!,
          sheet.monthly_fixed[m]!,
          0.005,
          `fixed m${m}`,
        );
        near(
          result.monthlyPreTaxProfit[m]!,
          sheet.monthly_pretax[m]!,
          0.005,
          `pretax m${m}`,
        );
      }
    });
  }
});

describe("computeMonthlyPI", () => {
  it("computes standard amortization", () => {
    // 200k loan, 7.5% APR, 30 yr -> ~$1398.43/mo
    const pi = computeMonthlyPI(200000, 0.075, 30);
    expect(pi).toBeGreaterThan(1390);
    expect(pi).toBeLessThan(1410);
  });

  it("returns 0 for zero loan", () => {
    expect(computeMonthlyPI(0, 0.075, 30)).toBe(0);
  });

  it("supports interest-only", () => {
    const pi = computeMonthlyPI(300000, 0.08, 30, true);
    expect(pi).toBeCloseTo((300000 * 0.08) / 12, 4);
  });
});

describe("computePITIA", () => {
  it("uses default property tax rate of 1.1%", () => {
    const p = computePITIA({
      price: 400000,
      downPayment: 200000,
      rateAPR: 0.075,
      termYears: 30,
    });
    expect(p.taxes).toBeCloseTo((400000 * 0.011) / 12, 4);
  });

  it("only applies PMI when LTV > 80%", () => {
    const lowLTV = computePITIA({
      price: 400000,
      downPayment: 200000,
      rateAPR: 0.075,
      termYears: 30,
    });
    const highLTV = computePITIA({
      price: 400000,
      downPayment: 40000,
      rateAPR: 0.075,
      termYears: 30,
    });
    expect(lowLTV.pmi).toBe(0);
    expect(highLTV.pmi).toBeGreaterThan(0);
  });
});

describe("estimateSTRAdrFromLTRRent", () => {
  it("returns 0 for non-positive input", () => {
    expect(estimateSTRAdrFromLTRRent(0)).toBe(0);
    expect(estimateSTRAdrFromLTRRent(-100)).toBe(0);
    expect(estimateSTRAdrFromLTRRent(NaN)).toBe(0);
  });

  it("estimates ADR as LTR_monthly * 12 * 1.7 / (365 * 0.65)", () => {
    const adr = estimateSTRAdrFromLTRRent(3000);
    expect(adr).toBeCloseTo((3000 * 12 * 1.7) / (365 * 0.65), 4);
    // Sanity check: ~$258/night for $3000/mo LTR rent.
    expect(adr).toBeGreaterThan(250);
    expect(adr).toBeLessThan(270);
  });
});

describe("computeBreakevenADR", () => {
  const baseSTR = {
    price: 500000,
    downPayment: 125000,
    rateAPR: 0.07,
    termYears: 30,
    strategy: "STR" as const,
    propertyTaxRatePct: 0.011,
    insuranceMonthly: 120,
    hoaMonthly: 0,
    utilitiesMonthly: 400,
    maintenanceMonthly: 100,
    miscMonthly: 100,
    managementFeeRate: 0.15,
    bookingFeeRate: 0.03,
    cleaningCostPerStay: 75,
    cleaningRevenuePerStay: 100,
    supplyCostPerStay: 7,
    monthlyOccupancy: new Array(12).fill(0.65),
    monthlyAvgStays: new Array(12).fill(8),
  };

  it("yields an ADR that, when applied uniformly, makes pretax profit ~0", () => {
    const adr = computeBreakevenADR(baseSTR);
    expect(adr).not.toBeNull();

    // Plug the break-even ADR back into the pro-forma — annual pretax should be ~0.
    const result = computeProForma({
      ...baseSTR,
      monthlyADR: new Array(12).fill(adr!),
    });
    expect(Math.abs(result.annualPreTaxProfit)).toBeLessThan(1);
  });

  it("returns null when no nights are rented", () => {
    const adr = computeBreakevenADR({
      ...baseSTR,
      monthlyOccupancy: new Array(12).fill(0),
    });
    expect(adr).toBeNull();
  });

  it("returns null when fees consume all revenue", () => {
    const adr = computeBreakevenADR({
      ...baseSTR,
      managementFeeRate: 0.6,
      bookingFeeRate: 0.5,
    });
    expect(adr).toBeNull();
  });
});

describe("computeDSCR", () => {
  it("returns rent / pitia", () => {
    expect(computeDSCR({ monthlyRent: 2400, pitiaTotal: 1800 })).toBeCloseTo(
      2400 / 1800,
      6,
    );
  });
  it("applies haircut", () => {
    expect(
      computeDSCR({ monthlyRent: 2400, pitiaTotal: 1800, rentHaircutPct: 0.25 }),
    ).toBeCloseTo((2400 * 0.75) / 1800, 6);
  });
  it("returns 0 if pitia is zero", () => {
    expect(computeDSCR({ monthlyRent: 2400, pitiaTotal: 0 })).toBe(0);
  });
});

describe("computeIRR", () => {
  it("solves a simple investment", () => {
    // -1000 in, +300/yr for 5 years -> IRR ~15.24%
    const r = computeIRR([-1000, 300, 300, 300, 300, 300]);
    expect(r).not.toBeNull();
    expect(r!).toBeGreaterThan(0.14);
    expect(r!).toBeLessThan(0.16);
  });
});
