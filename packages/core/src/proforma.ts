import { computeDSCR, computeMonthlyPI, computePITIA } from "./dscr";
import type { PITIA, ProFormaResult, Strategy } from "./schemas";

const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;

export interface ProFormaInputs {
  // Acquisition
  price: number;
  downPayment: number;
  improvements?: number;
  taxRate?: number;
  equityGained5Yr?: number;

  // Mortgage (computed P&I) — used unless monthlyPIOverride provided
  rateAPR?: number;
  termYears?: number;
  interestOnly?: boolean;
  monthlyPIOverride?: number;

  // Property carrying costs (monthly)
  propertyTaxRatePct?: number;
  taxesMonthlyOverride?: number;
  insuranceMonthly?: number;
  hoaMonthly?: number;
  pmiRatePct?: number;
  pmiMonthlyOverride?: number;
  utilitiesMonthly?: number;
  maintenanceMonthly?: number;
  miscMonthly?: number;

  // Yearly extras (Berkeley F16-F22): property tax assessment, local fees, advertising, etc.
  // These are subtracted again in the after-tax formula (matches Berkeley G8 = G7*(1-taxRate) - F23).
  yearlyTaxesAndOther?: number;

  // Strategy & rental assumptions
  strategy?: Strategy;
  managementFeeRate?: number;
  cleaningCostPerStay?: number;
  cleaningRevenuePerStay?: number;
  bookingFeeRate?: number;
  supplyCostPerStay?: number;

  // Per-month grid (Berkeley rows 31-34)
  monthlyNights?: number[];
  monthlyADR?: number[];
  monthlyOccupancy?: number[];
  monthlyAvgStays?: number[];

  // For LTR-only DSCR calc (alternative to ADR/occupancy grid)
  monthlyRentLTR?: number;
}

export interface ProFormaInputsResolved {
  price: number;
  downPayment: number;
  improvements: number;
  taxRate: number;
  equityGained5Yr: number;

  rateAPR: number;
  termYears: number;
  interestOnly: boolean;
  monthlyPIOverride: number | undefined;

  propertyTaxRatePct: number;
  taxesMonthlyOverride: number | undefined;
  insuranceMonthly: number;
  hoaMonthly: number;
  pmiRatePct: number;
  pmiMonthlyOverride: number | undefined;
  utilitiesMonthly: number;
  maintenanceMonthly: number;
  miscMonthly: number;
  yearlyTaxesAndOther: number;

  strategy: Strategy;
  managementFeeRate: number;
  cleaningCostPerStay: number;
  cleaningRevenuePerStay: number;
  bookingFeeRate: number;
  supplyCostPerStay: number;

  monthlyNights: number[];
  monthlyADR: number[];
  monthlyOccupancy: number[];
  monthlyAvgStays: number[];
  monthlyRentLTR: number;
}

export function resolveProFormaInputs(inputs: ProFormaInputs): ProFormaInputsResolved {
  const strategy = inputs.strategy ?? "LTR";

  const monthlyNights = inputs.monthlyNights ?? MONTH_DAYS.map((d) => d);
  const monthlyOccupancy =
    inputs.monthlyOccupancy ??
    new Array(12).fill(strategy === "STR" ? 0.7 : 1.0);
  const monthlyADR =
    inputs.monthlyADR ??
    new Array(12).fill(
      strategy === "STR" ? 200 : (inputs.monthlyRentLTR ?? 2500) / 30,
    );
  const monthlyAvgStays =
    inputs.monthlyAvgStays ?? new Array(12).fill(strategy === "STR" ? 8 : 1);

  return {
    price: inputs.price,
    downPayment: inputs.downPayment,
    improvements: inputs.improvements ?? 0,
    taxRate: inputs.taxRate ?? 0.3,
    equityGained5Yr: inputs.equityGained5Yr ?? 0,
    rateAPR: inputs.rateAPR ?? 0.075,
    termYears: inputs.termYears ?? 30,
    interestOnly: inputs.interestOnly ?? false,
    monthlyPIOverride: inputs.monthlyPIOverride,
    propertyTaxRatePct: inputs.propertyTaxRatePct ?? 0.011,
    taxesMonthlyOverride: inputs.taxesMonthlyOverride,
    insuranceMonthly: inputs.insuranceMonthly ?? 100,
    hoaMonthly: inputs.hoaMonthly ?? 0,
    pmiRatePct: inputs.pmiRatePct ?? 0.01,
    pmiMonthlyOverride: inputs.pmiMonthlyOverride,
    utilitiesMonthly: inputs.utilitiesMonthly ?? (strategy === "STR" ? 400 : 0),
    maintenanceMonthly: inputs.maintenanceMonthly ?? 100,
    miscMonthly: inputs.miscMonthly ?? 100,
    yearlyTaxesAndOther: inputs.yearlyTaxesAndOther ?? 0,
    strategy,
    managementFeeRate: inputs.managementFeeRate ?? 0,
    cleaningCostPerStay:
      inputs.cleaningCostPerStay ?? (strategy === "STR" ? 75 : 0),
    cleaningRevenuePerStay:
      inputs.cleaningRevenuePerStay ?? (strategy === "STR" ? 100 : 0),
    bookingFeeRate: inputs.bookingFeeRate ?? (strategy === "STR" ? 0.03 : 0),
    supplyCostPerStay:
      inputs.supplyCostPerStay ?? (strategy === "STR" ? 7 : 0),
    monthlyNights,
    monthlyADR,
    monthlyOccupancy,
    monthlyAvgStays,
    monthlyRentLTR: inputs.monthlyRentLTR ?? 0,
  };
}

/**
 * STR ADR estimation defaults — used both when scouting and when we don't
 * have a real ADR baseline from the user yet. Industry rule of thumb:
 * a property running as a vacation rental grosses roughly 1.7× its
 * LTR-equivalent monthly rent annually, at ~65% occupancy over the year.
 * (AirDNA / Airbnb studies put this in the 1.4–2.2× range; 1.7 is a
 * sensible middle for unknown markets.) Override per market when you have
 * AirDNA / comp data.
 */
export const STR_GROSS_VS_LTR_MULTIPLIER = 1.7;
export const STR_DEFAULT_OCCUPANCY = 0.65;

/**
 * Convert an LTR-equivalent monthly rent (e.g. Zillow's rentZestimate) to
 * an expected STR Average Daily Rate using the multiplier + occupancy
 * defaults above. Use this as a *baseline* for scouting; the user can
 * tighten it on the deal detail page once they have AirDNA comps.
 */
export function estimateSTRAdrFromLTRRent(monthlyLTRRent: number): number {
  if (!Number.isFinite(monthlyLTRRent) || monthlyLTRRent <= 0) return 0;
  const annualGrossSTR = monthlyLTRRent * 12 * STR_GROSS_VS_LTR_MULTIPLIER;
  const expectedRentedNights = 365 * STR_DEFAULT_OCCUPANCY;
  return annualGrossSTR / expectedRentedNights;
}

/**
 * Solve for the single, constant ADR that would make annual pre-tax
 * profit equal zero given the rest of the pro-forma inputs. Useful as a
 * "what daily rate does this deal need to clear?" sanity check on the
 * deal page. Assumes the same ADR for every month (the schedule of
 * nights × occupancy is taken from the inputs).
 *
 * Algebra (constant ADR `a`):
 *   annualRentalRev = a * Σ(nights_m * occ_m)
 *   annualCleaningRev = cleaningRev/stay * Σ stays_m
 *   annualVarCostsExclADR
 *     = (cleaningCost + supplyCost)/stay * Σ stays_m
 *     + (managementFee + bookingFee) * annualRentalRev
 *   annualFixed = fixedMonthly * 12
 *   profit = annualRentalRev * (1 - mgmtRate - bookingRate)
 *          + cleaningRev/stay * Σ stays_m
 *          - (cleaningCost + supplyCost)/stay * Σ stays_m
 *          - annualFixed
 *   => a = (annualFixed + perStayCostOut - perStayRevIn)
 *          / (Σ(nights_m * occ_m) * (1 - mgmtRate - bookingRate))
 *
 * Returns `null` if effective rented nights is zero (can't break even at
 * any ADR), or if the marginal-revenue multiplier (1 - mgmt - booking)
 * is ≤ 0 (every dollar of revenue is eaten by fees — also unsolvable).
 */
export function computeBreakevenADR(inputs: ProFormaInputs): number | null {
  const r = resolveProFormaInputs(inputs);
  const pitia = computePITIAForProForma(r);
  const fixedMonthly =
    pitia.total + r.utilitiesMonthly + r.maintenanceMonthly + r.miscMonthly;

  let effectiveNights = 0;
  let totalStays = 0;
  for (let m = 0; m < 12; m++) {
    const nights = r.monthlyNights[m] ?? MONTH_DAYS[m]!;
    const occ = r.monthlyOccupancy[m] ?? 0;
    const stays = r.monthlyAvgStays[m] ?? 0;
    effectiveNights += nights * occ;
    totalStays += stays;
  }

  const marginalRate = 1 - r.managementFeeRate - r.bookingFeeRate;
  if (effectiveNights <= 0 || marginalRate <= 0) return null;

  const perStayRevIn = r.cleaningRevenuePerStay * totalStays;
  const perStayCostOut = (r.cleaningCostPerStay + r.supplyCostPerStay) * totalStays;
  const annualFixed = fixedMonthly * 12;

  const adr = (annualFixed + perStayCostOut - perStayRevIn) /
    (effectiveNights * marginalRate);
  return adr;
}

/**
 * Newton-Raphson IRR. Returns null if it fails to converge.
 */
export function computeIRR(cashflows: number[], guess = 0.1): number | null {
  let rate = guess;
  for (let i = 0; i < 200; i++) {
    let npv = 0;
    let dnpv = 0;
    for (let t = 0; t < cashflows.length; t++) {
      const cf = cashflows[t]!;
      const denom = Math.pow(1 + rate, t);
      npv += cf / denom;
      if (t > 0) dnpv -= (t * cf) / (denom * (1 + rate));
    }
    if (Math.abs(npv) < 1e-7) return rate;
    if (Math.abs(dnpv) < 1e-12) return null;
    const next = rate - npv / dnpv;
    if (!isFinite(next)) return null;
    if (Math.abs(next - rate) < 1e-8) return next;
    rate = next;
    if (rate < -0.99) rate = -0.99;
  }
  return null;
}

/**
 * Compute the PITIA used by the pro-forma, honoring optional overrides
 * (Berkeley's sheet hand-enters P&I, so we let callers do the same).
 */
function computePITIAForProForma(r: ProFormaInputsResolved): PITIA {
  const computed = computePITIA({
    price: r.price,
    downPayment: r.downPayment,
    rateAPR: r.rateAPR,
    termYears: r.termYears,
    propertyTaxRatePct: r.propertyTaxRatePct,
    insuranceMonthly: r.insuranceMonthly,
    hoaMonthly: r.hoaMonthly,
    pmiRatePct: r.pmiRatePct,
    interestOnly: r.interestOnly,
  });

  const principalAndInterest =
    r.monthlyPIOverride !== undefined ? r.monthlyPIOverride : computed.principalAndInterest;
  const taxes =
    r.taxesMonthlyOverride !== undefined ? r.taxesMonthlyOverride : computed.taxes;
  const pmi =
    r.pmiMonthlyOverride !== undefined ? r.pmiMonthlyOverride : computed.pmi;
  const insurance = r.insuranceMonthly;
  const hoa = r.hoaMonthly;
  const total = principalAndInterest + taxes + insurance + hoa + pmi;

  return { principalAndInterest, taxes, insurance, hoa, pmi, total };
}

export function computeProForma(inputs: ProFormaInputs): ProFormaResult {
  const r = resolveProFormaInputs(inputs);
  const pitiaMonthly = computePITIAForProForma(r);

  const monthlyRevenue: number[] = [];
  const monthlyVariableCosts: number[] = [];
  const monthlyContributions: number[] = [];
  const monthlyFixedCosts: number[] = [];
  const monthlyPreTaxProfit: number[] = [];

  // Berkeley row 53 = SUM(C48:C52): mortgage+taxes+PMI (C48 = "Loan/Tax/PMI" = $C$20),
  // utilities (C49), maintenance (C50), insurance (C51), misc (C52).
  // Our pitiaMonthly.total already covers P&I + taxes + insurance + HOA + PMI, so we add
  // utilities, maintenance, and misc on top.
  const fixedMonthly =
    pitiaMonthly.total +
    r.utilitiesMonthly +
    r.maintenanceMonthly +
    r.miscMonthly;

  for (let m = 0; m < 12; m++) {
    const nights = r.monthlyNights[m] ?? MONTH_DAYS[m]!;
    const adr = r.monthlyADR[m] ?? 0;
    const occ = r.monthlyOccupancy[m] ?? 0;
    const stays = r.monthlyAvgStays[m] ?? 0;

    const rentalRevenue = nights * adr * occ;
    const cleaningRevenue = r.cleaningRevenuePerStay * stays;
    const totalRevenue = rentalRevenue + cleaningRevenue;

    const managementFee = r.managementFeeRate * rentalRevenue;
    const cleaningCost = r.cleaningCostPerStay * stays;
    const bookingCost = r.bookingFeeRate * rentalRevenue;
    const suppliesCost = r.supplyCostPerStay * stays;
    const variableCosts =
      managementFee + cleaningCost + bookingCost + suppliesCost;

    const contribution = totalRevenue - variableCosts;
    const preTax = contribution - fixedMonthly;

    monthlyRevenue.push(totalRevenue);
    monthlyVariableCosts.push(variableCosts);
    monthlyContributions.push(contribution);
    monthlyFixedCosts.push(fixedMonthly);
    monthlyPreTaxProfit.push(preTax);
  }

  const annualRevenue = monthlyRevenue.reduce((a, b) => a + b, 0);
  const annualPreTaxProfit = monthlyPreTaxProfit.reduce((a, b) => a + b, 0);
  const annualPostTaxProfit =
    annualPreTaxProfit * (1 - r.taxRate) - r.yearlyTaxesAndOther;

  const initialSunkInvestment = r.downPayment + r.improvements;
  const cashOnCashReturn =
    initialSunkInvestment > 0
      ? annualPreTaxProfit / initialSunkInvestment
      : 0;
  const payoutYears =
    annualPreTaxProfit !== 0
      ? initialSunkInvestment / annualPreTaxProfit
      : Infinity;

  // Berkeley uses a slightly different after-tax figure for IRR / equity multiple:
  // C60..H60 = O55 * (1 - taxRate), i.e. it does NOT subtract yearlyTaxesAndOther (F23).
  // We mirror the spreadsheet to keep parity.
  const annualAfterTaxForIRR = annualPreTaxProfit * (1 - r.taxRate);
  const irrCashflows = [
    -initialSunkInvestment,
    annualAfterTaxForIRR,
    annualAfterTaxForIRR,
    annualAfterTaxForIRR,
    annualAfterTaxForIRR,
    annualAfterTaxForIRR,
  ];
  const irr5Yr = computeIRR(irrCashflows);

  const equityMultiple5Yr =
    initialSunkInvestment > 0
      ? (r.equityGained5Yr + annualAfterTaxForIRR * 5) / initialSunkInvestment
      : 0;

  const annualRentForDSCR =
    r.strategy === "STR"
      ? annualRevenue
      : r.monthlyRentLTR > 0
        ? r.monthlyRentLTR * 12
        : annualRevenue;
  const monthlyRentForDSCR = annualRentForDSCR / 12;

  const dscr = computeDSCR({
    monthlyRent: monthlyRentForDSCR,
    pitiaTotal: pitiaMonthly.total,
  });
  const dscrLenderHaircut = computeDSCR({
    monthlyRent: monthlyRentForDSCR,
    pitiaTotal: pitiaMonthly.total,
    rentHaircutPct: 0.25,
  });

  void computeMonthlyPI;

  return {
    monthlyRevenue,
    monthlyVariableCosts,
    monthlyContributions,
    monthlyFixedCosts,
    monthlyPreTaxProfit,
    annualRevenue,
    annualPreTaxProfit,
    annualPostTaxProfit,
    initialSunkInvestment,
    cashOnCashReturn,
    payoutYears,
    irr5Yr,
    equityMultiple5Yr,
    pitiaMonthly,
    dscr,
    dscrLenderHaircut,
  };
}
