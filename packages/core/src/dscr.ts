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
 * Default annual home-owner insurance premium as a fraction of price. The US
 * average is ~0.35% of home value per year (NAIC / Bankrate 2025); coastal
 * and wildfire-prone markets run higher (often 0.6–1.0%). 0.35% is a
 * reasonable starting point that callers can override.
 */
export const DEFAULT_INSURANCE_RATE_PCT = 0.0035;

/**
 * Convert a property price to an estimated monthly insurance premium using
 * the price-percentage rule of thumb. Returns 0 for non-positive prices so
 * the proforma doesn't crash on a malformed input.
 */
export function estimateInsuranceMonthly(
  price: number,
  ratePct: number = DEFAULT_INSURANCE_RATE_PCT,
): number {
  if (!Number.isFinite(price) || price <= 0) return 0;
  return (price * ratePct) / 12;
}

/**
 * Effective property tax rates by state (annual tax as a fraction of home
 * value), approximating Tax Foundation / Census ACS effective rates on
 * owner-occupied housing (2024-2025). These replace the old flat 1.1%
 * national default at scout time: a 1.1% assumption understated carrying
 * costs by $300-700/mo on a $400k house in NJ/IL/TX and overstated them in
 * HI/AL/CO. Used as a *fallback* — when the listing source exposes the
 * property's actual tax rate we prefer that.
 */
export const PROPERTY_TAX_RATE_BY_STATE: Record<string, number> = {
  AL: 0.004, AK: 0.0114, AZ: 0.0063, AR: 0.0064, CA: 0.0075, CO: 0.0055,
  CT: 0.0178, DE: 0.0061, DC: 0.0057, FL: 0.0091, GA: 0.0092, HI: 0.0032,
  ID: 0.0067, IL: 0.0208, IN: 0.0084, IA: 0.0152, KS: 0.0134, KY: 0.0085,
  LA: 0.0056, ME: 0.0124, MD: 0.0105, MA: 0.0114, MI: 0.0138, MN: 0.0111,
  MS: 0.0067, MO: 0.0098, MT: 0.0074, NE: 0.0163, NV: 0.0059, NH: 0.0193,
  NJ: 0.0223, NM: 0.0067, NY: 0.0164, NC: 0.0082, ND: 0.0098, OH: 0.0159,
  OK: 0.0089, OR: 0.0093, PA: 0.0149, RI: 0.014, SC: 0.0057, SD: 0.0117,
  TN: 0.0067, TX: 0.0168, UT: 0.0057, VT: 0.0183, VA: 0.0087, WA: 0.0087,
  WV: 0.0057, WI: 0.0161, WY: 0.0056,
};

/**
 * Homeowner insurance premium as a fraction of home value per year, by
 * state. Derived from average annual premiums vs. median home values
 * (Bankrate / NerdWallet 2025): hail/tornado alley (OK, KS, NE) and
 * hurricane states (FL, LA) run 2-3x the national ~0.35%, while the West
 * Coast and Hawaii run below it. Approximations — the deal page lets the
 * user enter the real quote.
 */
export const INSURANCE_RATE_PCT_BY_STATE: Record<string, number> = {
  AL: 0.007, AK: 0.003, AZ: 0.004, AR: 0.008, CA: 0.0035, CO: 0.006,
  CT: 0.003, DE: 0.003, DC: 0.002, FL: 0.01, GA: 0.005, HI: 0.0015,
  ID: 0.004, IL: 0.0045, IN: 0.005, IA: 0.006, KS: 0.009, KY: 0.006,
  LA: 0.01, ME: 0.003, MD: 0.003, MA: 0.0025, MI: 0.005, MN: 0.005,
  MS: 0.008, MO: 0.007, MT: 0.006, NE: 0.009, NV: 0.003, NH: 0.003,
  NJ: 0.003, NM: 0.005, NY: 0.0035, NC: 0.004, ND: 0.007, OH: 0.0045,
  OK: 0.011, OR: 0.0025, PA: 0.0035, RI: 0.0035, SC: 0.005, SD: 0.008,
  TN: 0.005, TX: 0.008, UT: 0.0025, VT: 0.003, VA: 0.0035, WA: 0.0025,
  WV: 0.005, WI: 0.004, WY: 0.005,
};

function normalizeStateCode(state: string | null | undefined): string | null {
  if (typeof state !== "string") return null;
  const code = state.trim().toUpperCase();
  return code.length === 2 ? code : null;
}

/** State-aware effective property tax rate; national 1.1% when unknown. */
export function propertyTaxRateForState(
  state: string | null | undefined,
): number {
  const code = normalizeStateCode(state);
  return (code && PROPERTY_TAX_RATE_BY_STATE[code]) || DEFAULT_PROPERTY_TAX_RATE_PCT;
}

/** State-aware insurance rate (annual fraction of value); 0.35% when unknown. */
export function insuranceRateForState(
  state: string | null | undefined,
): number {
  const code = normalizeStateCode(state);
  return (code && INSURANCE_RATE_PCT_BY_STATE[code]) || DEFAULT_INSURANCE_RATE_PCT;
}

/**
 * Maintenance + CapEx reserve rule of thumb: 1% of property value per year,
 * floored at $100/mo so cheap properties don't get an implausible $20/mo
 * budget. Replaces the old flat $100/mo default, which gave a $900k house
 * the same repair budget as a $150k one.
 */
export const DEFAULT_MAINTENANCE_RATE_PCT = 0.01;

export function estimateMaintenanceMonthly(price: number): number {
  if (!Number.isFinite(price) || price <= 0) return 100;
  return Math.max(100, (price * DEFAULT_MAINTENANCE_RATE_PCT) / 12);
}

/**
 * Assumed monthly HOA fee when the listing did not report one, keyed by
 * Zillow homeType. Detached homes usually genuinely have no HOA, but a
 * condo listing with no fee in the payload almost certainly *does* have
 * one (US median condo fee is ~$300/mo) — treating "unknown" as $0 made
 * every under-reported condo look ~$300/mo more profitable than it is.
 * Confirmed values (including a real $0) always win over this assumption.
 */
export function assumeHoaMonthly(homeType: string | null | undefined): number {
  const t = typeof homeType === "string" ? homeType.toUpperCase() : "";
  if (t === "CONDO" || t === "APARTMENT" || t === "COOP") return 300;
  if (t === "TOWNHOUSE") return 150;
  return 0;
}

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
