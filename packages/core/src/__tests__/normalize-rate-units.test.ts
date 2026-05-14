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
