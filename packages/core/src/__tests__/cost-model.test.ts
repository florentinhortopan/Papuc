import { describe, expect, it } from "vitest";

import {
  assumeHoaMonthly,
  DEFAULT_INSURANCE_RATE_PCT,
  estimateMaintenanceMonthly,
  insuranceRateForState,
  propertyTaxRateForState,
} from "../dscr";
import { extractPropertyTaxRate } from "../hasdata";
import {
  computeProForma,
  DEFAULT_CLOSING_COSTS_PCT,
  DEFAULT_LTR_MANAGEMENT_FEE_RATE,
  DEFAULT_LTR_VACANCY_RATE,
} from "../proforma";

describe("propertyTaxRateForState", () => {
  it("returns high-tax-state rates well above the national default", () => {
    expect(propertyTaxRateForState("NJ")).toBeGreaterThan(0.02);
    expect(propertyTaxRateForState("TX")).toBeGreaterThan(0.015);
  });

  it("returns low-tax-state rates well below the national default", () => {
    expect(propertyTaxRateForState("HI")).toBeLessThan(0.005);
    expect(propertyTaxRateForState("AL")).toBeLessThan(0.005);
  });

  it("normalizes case and whitespace", () => {
    expect(propertyTaxRateForState(" nj ")).toBe(propertyTaxRateForState("NJ"));
  });

  it("falls back to 1.1% for unknown or missing states", () => {
    expect(propertyTaxRateForState(undefined)).toBeCloseTo(0.011, 6);
    expect(propertyTaxRateForState(null)).toBeCloseTo(0.011, 6);
    expect(propertyTaxRateForState("XX")).toBeCloseTo(0.011, 6);
    expect(propertyTaxRateForState("Texas")).toBeCloseTo(0.011, 6); // not a 2-letter code
  });
});

describe("insuranceRateForState", () => {
  it("charges hurricane/hail states a multiple of the base rate", () => {
    expect(insuranceRateForState("FL")).toBeGreaterThan(
      DEFAULT_INSURANCE_RATE_PCT * 2,
    );
    expect(insuranceRateForState("OK")).toBeGreaterThan(
      DEFAULT_INSURANCE_RATE_PCT * 2,
    );
  });

  it("charges the West Coast below the base rate", () => {
    expect(insuranceRateForState("WA")).toBeLessThan(DEFAULT_INSURANCE_RATE_PCT);
    expect(insuranceRateForState("HI")).toBeLessThan(DEFAULT_INSURANCE_RATE_PCT);
  });

  it("falls back to the national base rate when unknown", () => {
    expect(insuranceRateForState(undefined)).toBe(DEFAULT_INSURANCE_RATE_PCT);
    expect(insuranceRateForState("ZZ")).toBe(DEFAULT_INSURANCE_RATE_PCT);
  });
});

describe("estimateMaintenanceMonthly", () => {
  it("floors at $100/mo for cheap or invalid prices", () => {
    expect(estimateMaintenanceMonthly(50_000)).toBe(100);
    expect(estimateMaintenanceMonthly(0)).toBe(100);
    expect(estimateMaintenanceMonthly(NaN)).toBe(100);
  });

  it("scales at 1% of value per year above the floor", () => {
    expect(estimateMaintenanceMonthly(600_000)).toBeCloseTo(500, 6);
    expect(estimateMaintenanceMonthly(1_200_000)).toBeCloseTo(1000, 6);
  });
});

describe("assumeHoaMonthly", () => {
  it("assumes a typical fee for condo-like types", () => {
    expect(assumeHoaMonthly("CONDO")).toBe(300);
    expect(assumeHoaMonthly("APARTMENT")).toBe(300);
    expect(assumeHoaMonthly("TOWNHOUSE")).toBe(150);
  });

  it("assumes no HOA for detached and unknown types", () => {
    expect(assumeHoaMonthly("SINGLE_FAMILY")).toBe(0);
    expect(assumeHoaMonthly(null)).toBe(0);
    expect(assumeHoaMonthly(undefined)).toBe(0);
  });
});

describe("LTR vacancy allowance", () => {
  const base = {
    price: 400_000,
    downPayment: 80_000,
    rateAPR: 0.07,
    termYears: 30,
    strategy: "LTR" as const,
    monthlyRentLTR: 3000,
  };

  it("defaults to 5% of rental revenue in the cashflow", () => {
    const withVacancy = computeProForma(base);
    const noVacancy = computeProForma({ ...base, vacancyRateLTR: 0 });
    expect(withVacancy.annualRevenue).toBeCloseTo(
      noVacancy.annualRevenue * (1 - DEFAULT_LTR_VACANCY_RATE),
      4,
    );
    expect(withVacancy.annualPreTaxProfit).toBeLessThan(
      noVacancy.annualPreTaxProfit,
    );
  });

  it("does NOT change DSCR (lenders qualify on gross market rent)", () => {
    const withVacancy = computeProForma(base);
    const noVacancy = computeProForma({ ...base, vacancyRateLTR: 0 });
    expect(withVacancy.dscr).toBeCloseTo(noVacancy.dscr, 10);
  });

  it("is ignored when an explicit occupancy grid is provided", () => {
    const explicit = computeProForma({
      ...base,
      monthlyOccupancy: new Array(12).fill(1),
    });
    const noVacancy = computeProForma({ ...base, vacancyRateLTR: 0 });
    expect(explicit.annualRevenue).toBeCloseTo(noVacancy.annualRevenue, 4);
  });
});

describe("management fee defaults", () => {
  const base = {
    price: 400_000,
    downPayment: 80_000,
    rateAPR: 0.07,
    termYears: 30,
    strategy: "LTR" as const,
    monthlyRentLTR: 3000,
  };

  it("LTR defaults to 8% of rental revenue", () => {
    const managed = computeProForma(base);
    const selfManaged = computeProForma({ ...base, managementFeeRate: 0 });
    const feePaid =
      selfManaged.annualPreTaxProfit - managed.annualPreTaxProfit;
    expect(feePaid).toBeCloseTo(
      managed.annualRevenue * DEFAULT_LTR_MANAGEMENT_FEE_RATE,
      2,
    );
  });

  it("STR defaults to 15% of nightly revenue", () => {
    const str = {
      ...base,
      strategy: "STR" as const,
      monthlyRentLTR: 0,
      monthlyADR: new Array(12).fill(250),
      monthlyOccupancy: new Array(12).fill(0.65),
      monthlyAvgStays: new Array(12).fill(8),
    };
    const managed = computeProForma(str);
    const selfManaged = computeProForma({ ...str, managementFeeRate: 0 });
    // Fee applies to rental revenue only (not cleaning income), so just
    // assert direction and a sane magnitude (~15% of gross).
    const feePaid = selfManaged.annualPreTaxProfit - managed.annualPreTaxProfit;
    expect(feePaid).toBeGreaterThan(managed.annualRevenue * 0.1);
    expect(feePaid).toBeLessThan(managed.annualRevenue * 0.16);
  });
});

describe("closing costs in initial investment", () => {
  const base = {
    price: 400_000,
    downPayment: 80_000,
    rateAPR: 0.07,
    termYears: 30,
    strategy: "LTR" as const,
    monthlyRentLTR: 4000,
  };

  it("defaults to 0 for Berkeley-sheet parity", () => {
    const r = computeProForma({ ...base, improvements: 5000 });
    expect(r.initialSunkInvestment).toBe(85_000);
  });

  it("adds to the sunk investment and dilutes cash-on-cash", () => {
    const closing = base.price * DEFAULT_CLOSING_COSTS_PCT;
    const without = computeProForma(base);
    const withClosing = computeProForma({ ...base, closingCosts: closing });
    expect(withClosing.initialSunkInvestment).toBe(80_000 + closing);
    // Monthly cashflow is untouched; only return-on-cash metrics move.
    expect(withClosing.annualPreTaxProfit).toBeCloseTo(
      without.annualPreTaxProfit,
      6,
    );
    expect(withClosing.cashOnCashReturn).toBeLessThan(without.cashOnCashReturn);
  });
});

describe("extractPropertyTaxRate", () => {
  it("converts Zillow's percentage field to a decimal fraction", () => {
    expect(extractPropertyTaxRate({ propertyTaxRate: 1.98 })).toBeCloseTo(
      0.0198,
      6,
    );
    expect(
      extractPropertyTaxRate({ resoFacts: { propertyTaxRate: 0.75 } }),
    ).toBeCloseTo(0.0075, 6);
  });

  it("derives the rate from annual tax amount / price when no rate field", () => {
    expect(
      extractPropertyTaxRate({
        taxAnnualAmount: 8000,
        price: 400_000,
      }),
    ).toBeCloseTo(0.02, 6);
    expect(
      extractPropertyTaxRate({
        resoFacts: { taxAnnualAmount: 3300 },
        zestimate: 300_000,
      }),
    ).toBeCloseTo(0.011, 6);
  });

  it("rejects out-of-range values (unit confusion guards)", () => {
    expect(extractPropertyTaxRate({ propertyTaxRate: 45 })).toBeUndefined();
    expect(extractPropertyTaxRate({ propertyTaxRate: 0.01 })).toBeUndefined();
    expect(
      extractPropertyTaxRate({ taxAnnualAmount: 90_000, price: 400_000 }),
    ).toBeUndefined();
    expect(extractPropertyTaxRate({})).toBeUndefined();
  });
});
