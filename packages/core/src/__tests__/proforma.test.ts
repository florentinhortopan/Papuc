import { describe, expect, it } from "vitest";

import {
  computeBreakevenADR,
  computeIRR,
  computeProForma,
  estimateSTRAdrFromLTRRent,
  solveBreakevenDownPayment,
  solveBreakevenPrice,
} from "../proforma";
import {
  computeAutoPMIRate,
  computeAutoPMIRateFromLoan,
  computeDSCR,
  computeMonthlyPI,
  computePITIA,
} from "../dscr";

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

describe("computeAutoPMIRate", () => {
  it("returns 0 at and below 80% LTV", () => {
    expect(computeAutoPMIRate(0.5)).toBe(0);
    expect(computeAutoPMIRate(0.8)).toBe(0);
  });

  it("buckets at industry-standard rates above 80%", () => {
    expect(computeAutoPMIRate(0.85)).toBe(0.0055);
    expect(computeAutoPMIRate(0.9)).toBe(0.0075);
    expect(computeAutoPMIRate(0.95)).toBe(0.011);
    expect(computeAutoPMIRate(0.97)).toBe(0.015);
  });

  it("guards against non-finite inputs", () => {
    expect(computeAutoPMIRate(Number.NaN)).toBe(0);
    expect(computeAutoPMIRate(Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe("computeAutoPMIRateFromLoan", () => {
  it("derives 0 PMI when 20% or more is down", () => {
    // 400k price, 80k down → LTV 80%
    expect(computeAutoPMIRateFromLoan(400000, 80000)).toBe(0);
  });

  it("derives correct bucket for 90% LTV", () => {
    expect(computeAutoPMIRateFromLoan(400000, 40000)).toBe(0.0075);
  });

  it("returns 0 for zero or negative price", () => {
    expect(computeAutoPMIRateFromLoan(0, 0)).toBe(0);
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

/**
 * End-to-end sanity checks that every cost the user can see on the deal
 * page actually moves the cashflow / break-even numbers. If one of these
 * regresses it means we've silently dropped a line item out of the
 * sustainability calc — which is exactly the bug the user asked us to
 * guard against (a "positive cashflow" badge that ignored HOA or PMI).
 */
describe("Cashflow & break-even include every cost", () => {
  const baseLTR = {
    price: 500000,
    downPayment: 100000, // LTV 80%, no PMI by default
    rateAPR: 0.07,
    termYears: 30,
    strategy: "LTR" as const,
    monthlyRentLTR: 4000,
    propertyTaxRatePct: 0.011,
    insuranceMonthly: 150,
    hoaMonthly: 0,
    utilitiesMonthly: 0,
    maintenanceMonthly: 100,
    miscMonthly: 100,
  };

  it("HOA reduces annual pre-tax profit by exactly hoaMonthly * 12", () => {
    const withoutHoa = computeProForma(baseLTR);
    const withHoa = computeProForma({ ...baseLTR, hoaMonthly: 250 });
    const delta = withoutHoa.annualPreTaxProfit - withHoa.annualPreTaxProfit;
    expect(delta).toBeCloseTo(250 * 12, 4);
    expect(withHoa.pitiaMonthly.hoa).toBe(250);
  });

  it("PMI kicks in only when LTV > 80% and reduces cashflow", () => {
    // 100k down on 500k = LTV 80%, no PMI applied
    const ltv80 = computeProForma(baseLTR);
    expect(ltv80.pitiaMonthly.pmi).toBe(0);

    // 50k down on 500k = LTV 90%, PMI auto-rate kicks in
    const ltv90 = computeProForma({ ...baseLTR, downPayment: 50000 });
    expect(ltv90.pitiaMonthly.pmi).toBeGreaterThan(0);

    // Going from LTV 80% to LTV 90% should reduce cashflow (more loan +
    // PMI). Confirm both effects are present in annualPreTaxProfit.
    const drop = ltv80.annualPreTaxProfit - ltv90.annualPreTaxProfit;
    expect(drop).toBeGreaterThan(ltv90.pitiaMonthly.pmi * 12);
  });

  it("Insurance default scales with price (not a flat $100/mo)", () => {
    const cheap = computeProForma({
      price: 200000,
      downPayment: 40000,
      rateAPR: 0.07,
      termYears: 30,
      monthlyRentLTR: 2000,
    });
    const pricey = computeProForma({
      price: 1500000,
      downPayment: 300000,
      rateAPR: 0.07,
      termYears: 30,
      monthlyRentLTR: 12000,
    });
    expect(pricey.pitiaMonthly.insurance).toBeGreaterThan(
      cheap.pitiaMonthly.insurance * 3,
    );
  });

  it("HOA shifts the break-even ADR for STR deals", () => {
    const baseSTR = {
      price: 500000,
      downPayment: 125000,
      rateAPR: 0.07,
      termYears: 30,
      strategy: "STR" as const,
      propertyTaxRatePct: 0.011,
      insuranceMonthly: 150,
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
    const noHoa = computeBreakevenADR({ ...baseSTR, hoaMonthly: 0 });
    const withHoa = computeBreakevenADR({ ...baseSTR, hoaMonthly: 300 });
    expect(noHoa).not.toBeNull();
    expect(withHoa).not.toBeNull();
    expect(withHoa!).toBeGreaterThan(noHoa!);
  });

  it("PMI shifts the break-even ADR for STR deals", () => {
    const baseSTR = {
      price: 500000,
      downPayment: 50000, // LTV 90%, PMI applies
      rateAPR: 0.07,
      termYears: 30,
      strategy: "STR" as const,
      propertyTaxRatePct: 0.011,
      insuranceMonthly: 150,
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
    const withPmi = computeBreakevenADR(baseSTR);
    const withoutPmi = computeBreakevenADR({ ...baseSTR, pmiRatePct: 0 });
    expect(withPmi).not.toBeNull();
    expect(withoutPmi).not.toBeNull();
    expect(withPmi!).toBeGreaterThan(withoutPmi!);
  });

  it("PITIA breakdown sums to PITIA.total (no costs leaked)", () => {
    const r = computeProForma({
      ...baseLTR,
      hoaMonthly: 200,
      downPayment: 25000, // force PMI on too
    });
    const { principalAndInterest, taxes, insurance, hoa, pmi, total } =
      r.pitiaMonthly;
    expect(principalAndInterest + taxes + insurance + hoa + pmi).toBeCloseTo(
      total,
      6,
    );
  });
});

describe("solveBreakevenPrice / solveBreakevenDownPayment", () => {
  // A meaningfully unprofitable LTR baseline: rent only covers part of PITIA.
  const baseline = {
    price: 600000,
    downPayment: 60000, // 10% down → LTV 90% → PMI applies
    rateAPR: 0.07,
    termYears: 30,
    strategy: "LTR" as const,
    monthlyRentLTR: 3200,
    propertyTaxRatePct: 0.011,
    utilitiesMonthly: 0,
    maintenanceMonthly: 100,
    miscMonthly: 100,
  };

  it("solveBreakevenPrice returns a price where annualPreTaxProfit ~= 0", () => {
    const baseProfit = computeProForma(baseline).annualPreTaxProfit;
    expect(baseProfit).toBeLessThan(0); // baseline must be unprofitable

    const bePrice = solveBreakevenPrice(baseline);
    expect(bePrice).not.toBeNull();
    expect(bePrice!).toBeLessThan(baseline.price);

    const verify = computeProForma({
      ...baseline,
      price: bePrice!,
    }).annualPreTaxProfit;
    expect(Math.abs(verify)).toBeLessThan(50); // within $50/yr of zero
  });

  it("solveBreakevenDownPayment returns a down where annualPreTaxProfit ~= 0", () => {
    const beDown = solveBreakevenDownPayment(baseline);
    expect(beDown).not.toBeNull();
    expect(beDown!).toBeGreaterThan(baseline.downPayment);

    const verify = computeProForma({
      ...baseline,
      downPayment: beDown!,
    }).annualPreTaxProfit;
    expect(Math.abs(verify)).toBeLessThan(50);
  });

  it("solveBreakevenPrice for a profitable deal returns a price above current", () => {
    // A deal that's already in the black has a break-even price; it's
    // just *higher* than current (the most you could pay and still
    // break even on cashflow).
    const profitable = { ...baseline, monthlyRentLTR: 10000 };
    const bePrice = solveBreakevenPrice(profitable);
    expect(bePrice).not.toBeNull();
    expect(bePrice!).toBeGreaterThan(profitable.price);
  });

  it("solveBreakevenDownPayment returns null for a hopelessly unprofitable deal", () => {
    // Rent so low that even an all-cash purchase still loses money to
    // taxes + insurance + maintenance.
    const hopeless = { ...baseline, monthlyRentLTR: 100 };
    expect(solveBreakevenDownPayment(hopeless)).toBeNull();
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
