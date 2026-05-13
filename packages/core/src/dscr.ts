import type { PITIA } from "./schemas";

export interface PITIAInputs {
  price: number;
  downPayment: number;
  rateAPR: number;
  termYears: number;
  propertyTaxRatePct?: number;
  insuranceMonthly?: number;
  hoaMonthly?: number;
  pmiRatePct?: number;
  interestOnly?: boolean;
}

const DEFAULT_PROPERTY_TAX_RATE_PCT = 0.011;
const DEFAULT_PMI_RATE_PCT = 0.01;
const DEFAULT_INSURANCE_MONTHLY = 100;
const DEFAULT_HOA_MONTHLY = 0;

/**
 * Auto-derived annual PMI rate as a decimal of the loan amount, bucketed by
 * LTV. PMI is only required when LTV exceeds 80%. Rates are industry averages
 * for conforming conventional loans (Freddie Mac / Bankrate 2024-2026); DSCR
 * loans for investors tend to fall in the same range or slightly higher.
 *
 * Schedule:
 *   LTV ≤ 80%     →  0.00% (no PMI)
 *   80% < LTV ≤ 85% →  0.55%
 *   85% < LTV ≤ 90% →  0.75%
 *   90% < LTV ≤ 95% →  1.10%
 *           LTV > 95% →  1.50%
 *
 * Returns a decimal (e.g. 0.0055 = 0.55%), to match `pmiRatePct` elsewhere.
 */
export function computeAutoPMIRate(ltv: number): number {
  if (!Number.isFinite(ltv) || ltv <= 0.8) return 0;
  if (ltv <= 0.85) return 0.0055;
  if (ltv <= 0.9) return 0.0075;
  if (ltv <= 0.95) return 0.011;
  return 0.015;
}

/**
 * Convenience wrapper: derive LTV from price + downPayment and look up the
 * auto PMI rate. Returns 0 when the inputs make LTV non-positive.
 */
export function computeAutoPMIRateFromLoan(
  price: number,
  downPayment: number,
): number {
  if (price <= 0) return 0;
  const ltv = Math.max(0, price - downPayment) / price;
  return computeAutoPMIRate(ltv);
}

export function computeMonthlyPI(
  loanAmount: number,
  rateAPR: number,
  termYears: number,
  interestOnly = false,
): number {
  if (loanAmount <= 0) return 0;
  const monthlyRate = rateAPR / 12;
  if (interestOnly) return loanAmount * monthlyRate;
  const n = termYears * 12;
  if (monthlyRate === 0) return loanAmount / n;
  const factor = Math.pow(1 + monthlyRate, n);
  return (loanAmount * monthlyRate * factor) / (factor - 1);
}

export function computePITIA(inputs: PITIAInputs): PITIA {
  const {
    price,
    downPayment,
    rateAPR,
    termYears,
    propertyTaxRatePct = DEFAULT_PROPERTY_TAX_RATE_PCT,
    insuranceMonthly = DEFAULT_INSURANCE_MONTHLY,
    hoaMonthly = DEFAULT_HOA_MONTHLY,
    pmiRatePct = DEFAULT_PMI_RATE_PCT,
    interestOnly = false,
  } = inputs;

  const loanAmount = Math.max(0, price - downPayment);
  const principalAndInterest = computeMonthlyPI(
    loanAmount,
    rateAPR,
    termYears,
    interestOnly,
  );
  const taxes = (price * propertyTaxRatePct) / 12;
  const insurance = insuranceMonthly;
  const hoa = hoaMonthly;
  const ltv = price > 0 ? loanAmount / price : 0;
  const pmi = ltv > 0.8 ? (loanAmount * pmiRatePct) / 12 : 0;
  const total = principalAndInterest + taxes + insurance + hoa + pmi;

  return { principalAndInterest, taxes, insurance, hoa, pmi, total };
}

export interface DSCRInputs {
  monthlyRent: number;
  pitiaTotal: number;
  rentHaircutPct?: number;
}

export function computeDSCR({
  monthlyRent,
  pitiaTotal,
  rentHaircutPct = 0,
}: DSCRInputs): number {
  if (pitiaTotal <= 0) return 0;
  const effectiveRent = monthlyRent * (1 - rentHaircutPct);
  return effectiveRent / pitiaTotal;
}

export function dscrTier(dscr: number): "no-ratio" | "min" | "good" | "strong" {
  if (dscr < 1.0) return "no-ratio";
  if (dscr < 1.1) return "min";
  if (dscr < 1.25) return "good";
  return "strong";
}
