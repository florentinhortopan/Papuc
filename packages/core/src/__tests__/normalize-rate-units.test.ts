import { describe, expect, it } from "vitest";

import { normalizeRateUnits } from "../llm/claude";
import { ProjectConstraintsSchema } from "../schemas";

/**
 * Belt-and-suspenders defense against Claude returning out-of-band
 * mortgage / DSCR values. The schema is strict (LTV 0.05-0.95,
 * rateAPR 0-0.25, minDSCR 0-3) and Claude has a documented tendency
 * to drift between decimal and percentage representations from one
 * prompt to the next. The normalizer divides percentages by 100 then
 * clamps to schema bounds, so users never see a 4xx from a borderline
 * value like 0.96 LTV.
 */
const baseConstraints = {
  markets: [{ kind: "city", city: "Austin", state: "TX" }],
  mortgage: { rateAPR: 0.075, termYears: 30, ltv: 0.75 },
  propertyTypes: ["single_family"],
  strategy: "LTR",
  minDSCR: 1.0,
};

describe("normalizeRateUnits", () => {
  it("divides percent-formatted rateAPR by 100", () => {
    const out = normalizeRateUnits({
      ...baseConstraints,
      mortgage: { rateAPR: 7.5, termYears: 30, ltv: 0.75 },
    }) as typeof baseConstraints;
    expect(out.mortgage.rateAPR).toBeCloseTo(0.075, 6);
  });

  it("divides percent-formatted LTV by 100", () => {
    const out = normalizeRateUnits({
      ...baseConstraints,
      mortgage: { rateAPR: 0.075, termYears: 30, ltv: 75 },
    }) as typeof baseConstraints;
    expect(out.mortgage.ltv).toBeCloseTo(0.75, 6);
  });

  it("clamps borderline LTV (0.96) into the schema's max (0.95)", () => {
    const out = normalizeRateUnits({
      ...baseConstraints,
      mortgage: { rateAPR: 0.075, termYears: 30, ltv: 0.96 },
    }) as typeof baseConstraints;
    expect(out.mortgage.ltv).toBe(0.95);
    expect(ProjectConstraintsSchema.safeParse(out).success).toBe(true);
  });

  it("clamps LTV of exactly 1 (100% financing) to the max (0.95)", () => {
    const out = normalizeRateUnits({
      ...baseConstraints,
      mortgage: { rateAPR: 0.075, termYears: 30, ltv: 1 },
    }) as typeof baseConstraints;
    expect(out.mortgage.ltv).toBe(0.95);
    expect(ProjectConstraintsSchema.safeParse(out).success).toBe(true);
  });

  it("clamps a very high rateAPR like 0.30 down to 0.25", () => {
    const out = normalizeRateUnits({
      ...baseConstraints,
      mortgage: { rateAPR: 0.3, termYears: 30, ltv: 0.75 },
    }) as typeof baseConstraints;
    expect(out.mortgage.rateAPR).toBe(0.25);
    expect(ProjectConstraintsSchema.safeParse(out).success).toBe(true);
  });

  it("clamps minDSCR > 3 without dividing by 100", () => {
    const out = normalizeRateUnits({
      ...baseConstraints,
      minDSCR: 5.0,
    }) as typeof baseConstraints;
    expect(out.minDSCR).toBe(3);
  });

  it("leaves a clean object untouched", () => {
    const out = normalizeRateUnits({
      ...baseConstraints,
    }) as typeof baseConstraints;
    expect(out.mortgage.rateAPR).toBe(0.075);
    expect(out.mortgage.ltv).toBe(0.75);
    expect(out.minDSCR).toBe(1.0);
  });

  it("clamps NaN / Infinity to the lower bound rather than throwing", () => {
    const out = normalizeRateUnits({
      ...baseConstraints,
      mortgage: {
        rateAPR: Number.NaN,
        termYears: 30,
        ltv: Number.POSITIVE_INFINITY,
      },
    }) as typeof baseConstraints;
    expect(out.mortgage.rateAPR).toBe(0);
    // Infinity → divide by 100 = Infinity (not finite) → clamp → 0.05.
    expect(out.mortgage.ltv).toBe(0.05);
  });
});

describe("dollar-amount repair", () => {
  /**
   * Claude occasionally returns downPayment / totalCash as a percent
   * (25), a fraction (0.25), or as thousands-shorthand (200 instead of
   * 200000). These all pass the schema's `nonnegative` check and surface
   * to the UI as "Down payment $25", which is broken in a way the user
   * can't diagnose. The normalizer should rescue them when we have a
   * price to anchor against, and drop them otherwise.
   */
  it("scales a fractional downPayment (0.25) against priceMax", () => {
    const out = normalizeRateUnits({
      ...baseConstraints,
      priceMax: 500000,
      downPayment: 0.25,
    }) as Record<string, unknown>;
    expect(out.downPayment).toBe(125000);
  });

  it("scales a percent-shaped downPayment (25) against priceMax", () => {
    const out = normalizeRateUnits({
      ...baseConstraints,
      priceMax: 500000,
      downPayment: 25,
    }) as Record<string, unknown>;
    expect(out.downPayment).toBe(125000);
  });

  it("scales a thousands-shorthand priceMax (500) up to 500000", () => {
    const out = normalizeRateUnits({
      ...baseConstraints,
      priceMax: 500,
    }) as Record<string, unknown>;
    expect(out.priceMax).toBe(500000);
  });

  it("scales totalCash against the upgraded priceMax", () => {
    const out = normalizeRateUnits({
      ...baseConstraints,
      priceMax: 500, // thousands-shorthand
      totalCash: 40, // also shorthand-ish
    }) as Record<string, unknown>;
    // priceMax is repaired to 500000; totalCash (40) becomes
    // (40/100) * 500000 = 200000.
    expect(out.priceMax).toBe(500000);
    expect(out.totalCash).toBe(200000);
  });

  it("drops a suspicious downPayment when there is no price to anchor", () => {
    const out = normalizeRateUnits({
      ...baseConstraints,
      downPayment: 25,
    }) as Record<string, unknown>;
    expect(out.downPayment).toBeUndefined();
  });

  it("leaves a clean $200,000 downPayment alone", () => {
    const out = normalizeRateUnits({
      ...baseConstraints,
      priceMax: 600000,
      downPayment: 200000,
    }) as Record<string, unknown>;
    expect(out.downPayment).toBe(200000);
  });

  it("preserves a zero downPayment (no-money-down scenario)", () => {
    const out = normalizeRateUnits({
      ...baseConstraints,
      priceMax: 500000,
      downPayment: 0,
    }) as Record<string, unknown>;
    expect(out.downPayment).toBe(0);
  });

  it("returns constraints that pass ProjectConstraintsSchema end to end", () => {
    const out = normalizeRateUnits({
      ...baseConstraints,
      priceMax: 500, // shorthand
      downPayment: 25, // percent
      totalCash: 40, // shorthand-like
    }) as Record<string, unknown>;
    expect(ProjectConstraintsSchema.safeParse(out).success).toBe(true);
  });
});
