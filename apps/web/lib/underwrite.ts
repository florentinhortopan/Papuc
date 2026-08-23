import {
  assumeHoaMonthly,
  computeAutoPMIRateFromLoan,
  computeProForma,
  DEFAULT_CLOSING_COSTS_PCT,
  DEFAULT_LTR_MANAGEMENT_FEE_RATE,
  DEFAULT_LTR_VACANCY_RATE,
  DEFAULT_STR_MANAGEMENT_FEE_RATE,
  defaultStrSchedule,
  estimateInsuranceMonthly,
  estimateMaintenanceMonthly,
  insuranceRateForState,
  propertyTaxRateForState,
  strScheduleFromEstimate,
  type ProFormaInputs,
  type ProFormaResult,
  type ProjectConstraints,
  type StrMarketAdrIntel,
  type StrSchedule,
} from "@papuc/core";

import type { DealsRow } from "./database.types";

/**
 * THE single source of default underwriting assumptions for a persisted
 * deal. Client-safe (pure math, no supabase imports).
 *
 * Three surfaces show a cashflow for the same deal and must agree:
 *   - the deal-detail editor seeds its input fields from these values,
 *   - the public /share/[token] page computes its verdict live from them,
 *   - the scout underwrites through `underwriteDeal` (this module) and
 *     stores the result in deal_scores / the nightly digest email.
 *
 * The stored deal_scores row goes stale whenever the cost model evolves
 * (it's only refreshed on re-scout) — so anything user-facing that can
 * recompute, should recompute through this helper instead of trusting
 * the stored score. That exact staleness already bit once: share pages
 * quoted the old flat-cost cashflow while the detail page showed the new
 * location-aware one.
 */

export type UnderwritableDeal = Pick<
  DealsRow,
  | "price"
  | "est_value"
  | "est_rent"
  | "state"
  | "hoa_monthly"
  | "property_tax_rate"
  | "mls_data"
  | "str_adr"
  | "str_occupancy"
  | "str_monthly_distribution"
  | "str_estimated_at"
>;

export interface UnderwriteSeeds {
  strategy: "LTR" | "STR";
  price: number;
  downPayment: number;
  improvements: number;
  closingCosts: number;
  rateAPR: number;
  termYears: number;
  interestOnly: boolean;
  /** Annual fraction of value, e.g. 0.0223. */
  propertyTaxRatePct: number;
  /** Annual premium in $ (the detail editor's source of truth). */
  insuranceAnnual: number;
  hoaMonthly: number;
  utilitiesMonthly: number;
  maintenanceMonthly: number;
  miscMonthly: number;
  managementFeeRate: number;
  vacancyRateLTR: number;
  /** LTR-equivalent monthly rent (drives LTR revenue + STR ADR heuristic). */
  monthlyRent: number;
  /** 12-month STR schedule; null for LTR strategy. */
  strSchedule: StrSchedule | null;
}

export function underwriteSeeds(
  deal: UnderwritableDeal,
  constraints: ProjectConstraints,
  marketAdrIntel?: StrMarketAdrIntel | null,
): UnderwriteSeeds {
  const strategy = constraints.strategy === "STR" ? "STR" : "LTR";
  // Same purchase-price chain as the scout: list price → AVM/est_value →
  // project priceMax. Skipping est_value made off-market / AVM-only deals
  // underwrite at priceMax (or $400k) on the detail page while the digest
  // and deal_scores used the scouted AVM — cashflow/DSCR disagreed.
  const price = Number(
    deal.price ?? deal.est_value ?? constraints.priceMax ?? 400000,
  );
  const ltv = constraints.mortgage?.ltv ?? 0.8;
  // Treat 0 / missing as "derive from LTV" — same as the scout. A literal
  // $0 down would otherwise make every deal look free-financed.
  const downPayment = Number(
    constraints.downPayment != null && constraints.downPayment > 0
      ? constraints.downPayment
      : price * (1 - ltv),
  );
  const monthlyRent = Number(deal.est_rent ?? 2500);

  const homeType =
    deal.mls_data &&
    typeof (deal.mls_data as Record<string, unknown>).homeType === "string"
      ? ((deal.mls_data as Record<string, unknown>).homeType as string)
      : null;

  // STR schedule priority chain (same as the scout): comps-based AirROI
  // estimate on the deal row → rent heuristic clamped to researched
  // market ADR range → plain rent heuristic.
  let strSchedule: StrSchedule | null = null;
  if (strategy === "STR") {
    const hasEstimate =
      deal.str_estimated_at && deal.str_adr != null && deal.str_occupancy != null;
    const schedule = hasEstimate
      ? strScheduleFromEstimate({
          adr: Number(deal.str_adr),
          occupancy: Number(deal.str_occupancy),
          monthlyRevenueDistribution: Array.isArray(deal.str_monthly_distribution)
            ? (deal.str_monthly_distribution as number[])
            : null,
        })
      : defaultStrSchedule(monthlyRent, marketAdrIntel ?? undefined);
    strSchedule = {
      ...schedule,
      // Never seed a $0 nightly rate (unusable in the editor, nonsense
      // in the math) — same guard the detail editor always applied.
      monthlyADR: schedule.monthlyADR.map((a) => a || 200),
    };
  }

  return {
    strategy,
    price,
    downPayment,
    improvements: 0,
    closingCosts: Math.round(price * DEFAULT_CLOSING_COSTS_PCT),
    rateAPR: constraints.mortgage?.rateAPR ?? 0.075,
    termYears: constraints.mortgage?.termYears ?? 30,
    interestOnly: constraints.mortgage?.interestOnly ?? false,
    propertyTaxRatePct:
      deal.property_tax_rate != null
        ? Number(deal.property_tax_rate)
        : propertyTaxRateForState(deal.state),
    // Same formula as scout (`estimateInsuranceMonthly`) with a $400/yr
    // floor so tiny AVMs don't seed a nonsense near-zero premium.
    insuranceAnnual: Math.max(
      400,
      Math.round(
        estimateInsuranceMonthly(price, insuranceRateForState(deal.state)) * 12,
      ),
    ),
    hoaMonthly: Number(deal.hoa_monthly ?? assumeHoaMonthly(homeType)),
    utilitiesMonthly: strategy === "STR" ? 400 : 0,
    maintenanceMonthly: Math.round(estimateMaintenanceMonthly(price)),
    miscMonthly: 100,
    managementFeeRate:
      strategy === "STR"
        ? DEFAULT_STR_MANAGEMENT_FEE_RATE
        : DEFAULT_LTR_MANAGEMENT_FEE_RATE,
    vacancyRateLTR: DEFAULT_LTR_VACANCY_RATE,
    monthlyRent,
    strSchedule,
  };
}

export function underwriteInputs(s: UnderwriteSeeds): ProFormaInputs {
  return {
    price: s.price,
    downPayment: s.downPayment,
    improvements: s.improvements,
    closingCosts: s.closingCosts,
    rateAPR: s.rateAPR,
    termYears: s.termYears,
    interestOnly: s.interestOnly,
    propertyTaxRatePct: s.propertyTaxRatePct,
    insuranceMonthly: s.insuranceAnnual / 12,
    hoaMonthly: s.hoaMonthly,
    pmiRatePct: computeAutoPMIRateFromLoan(s.price, s.downPayment),
    utilitiesMonthly: s.utilitiesMonthly,
    maintenanceMonthly: s.maintenanceMonthly,
    miscMonthly: s.miscMonthly,
    managementFeeRate: s.managementFeeRate,
    vacancyRateLTR: s.vacancyRateLTR,
    strategy: s.strategy,
    monthlyRentLTR: s.strategy === "LTR" ? s.monthlyRent : 0,
    monthlyNights: s.strSchedule?.monthlyNights,
    monthlyADR: s.strSchedule?.monthlyADR,
    monthlyOccupancy: s.strSchedule?.monthlyOccupancy,
    monthlyAvgStays: s.strSchedule?.monthlyAvgStays,
  };
}

/** Seed + compute in one step (what the share page renders). */
export function underwriteDeal(
  deal: UnderwritableDeal,
  constraints: ProjectConstraints,
  marketAdrIntel?: StrMarketAdrIntel | null,
): { seeds: UnderwriteSeeds; result: ProFormaResult } {
  const seeds = underwriteSeeds(deal, constraints, marketAdrIntel);
  return { seeds, result: computeProForma(underwriteInputs(seeds)) };
}
