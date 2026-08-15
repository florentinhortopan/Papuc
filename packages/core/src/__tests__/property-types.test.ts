import { describe, expect, it } from "vitest";

import {
  PROPERTY_TYPE_LABELS,
  ProjectConstraintsSchema,
  type PropertyType,
} from "../index";
// LLM exports live off the barrel (see index.ts note on client bundles).
import { PARSE_PROJECT_TOOL } from "../llm/prompts";

/**
 * Tests around the expanded PropertyType enum: we want one source of
 * truth for the values across schemas.ts, the LLM tool descriptor, and
 * the label map used by the UI. If any of these drift, real users will
 * either see "land" rendered as "land" (no label), or Claude will pick a
 * value our Zod schema then rejects.
 */
describe("PropertyType expansion", () => {
  const expected: PropertyType[] = [
    "single_family",
    "condo",
    "townhouse",
    "multi_family_2_4",
    "multi_family_5_plus",
    "manufactured",
    "land",
    "mixed_use",
    "commercial",
    "any",
  ];

  it("includes every category in PROPERTY_TYPE_LABELS", () => {
    for (const t of expected) {
      expect(PROPERTY_TYPE_LABELS[t]).toBeTruthy();
    }
  });

  it("LLM tool schema enum matches the Zod enum", () => {
    const propertyTypes = (
      PARSE_PROJECT_TOOL.input_schema.properties.constraints as {
        properties: { propertyTypes: { items: { enum: string[] } } };
      }
    ).properties.propertyTypes.items.enum;
    expect([...propertyTypes].sort()).toEqual([...expected].sort());
  });

  it("rejects unknown property types at validation time", () => {
    const bad = ProjectConstraintsSchema.safeParse({
      markets: [{ kind: "zip", zip: "10001" }],
      mortgage: { rateAPR: 0.075, termYears: 30, ltv: 0.75 },
      propertyTypes: ["warehouse"],
    });
    expect(bad.success).toBe(false);
  });

  it("accepts the new commercial/mixed-use/land/manufactured values", () => {
    for (const t of [
      "commercial",
      "mixed_use",
      "land",
      "manufactured",
    ] as const) {
      const ok = ProjectConstraintsSchema.safeParse({
        markets: [{ kind: "zip", zip: "10001" }],
        mortgage: { rateAPR: 0.075, termYears: 30, ltv: 0.75 },
        propertyTypes: [t],
      });
      expect(ok.success, `failed for ${t}`).toBe(true);
    }
  });
});

describe("ProjectConstraints new optional filter fields", () => {
  it("accepts bedsMax/bathsMax/sqftMax/yearBuiltMin/daysOnMarketMax/hoaMax", () => {
    const ok = ProjectConstraintsSchema.safeParse({
      markets: [{ kind: "city", city: "Austin", state: "TX" }],
      mortgage: { rateAPR: 0.075, termYears: 30, ltv: 0.75 },
      propertyTypes: ["multi_family_2_4"],
      bedsMax: 6,
      bathsMax: 4,
      sqftMax: 5000,
      yearBuiltMin: 1990,
      daysOnMarketMax: "30d",
      hoaMax: 100,
    });
    expect(ok.success).toBe(true);
  });

  it("accepts hoaMax: 0 (no-HOA-only) and rejects negatives", () => {
    const zero = ProjectConstraintsSchema.safeParse({
      markets: [{ kind: "zip", zip: "10001" }],
      mortgage: { rateAPR: 0.075, termYears: 30, ltv: 0.75 },
      hoaMax: 0,
    });
    expect(zero.success).toBe(true);

    const negative = ProjectConstraintsSchema.safeParse({
      markets: [{ kind: "zip", zip: "10001" }],
      mortgage: { rateAPR: 0.075, termYears: 30, ltv: 0.75 },
      hoaMax: -50,
    });
    expect(negative.success).toBe(false);
  });

  it("exposes hoaMax in the Claude tool schema", () => {
    const constraints = PARSE_PROJECT_TOOL.input_schema.properties
      .constraints as { properties: Record<string, { type?: string; minimum?: number }> };
    const hoaMax = constraints.properties.hoaMax;
    expect(hoaMax).toBeTruthy();
    expect(hoaMax.type).toBe("number");
    expect(hoaMax.minimum).toBe(0);
  });

  it("accepts state-wide markets and lotSizeMinSqft (land searches)", () => {
    const ok = ProjectConstraintsSchema.safeParse({
      markets: [{ kind: "state", state: "CA" }],
      mortgage: { rateAPR: 0.075, termYears: 30, ltv: 0.75 },
      propertyTypes: ["land"],
      lotSizeMinSqft: 217_800, // 5 acres
    });
    expect(ok.success).toBe(true);

    const negativeLot = ProjectConstraintsSchema.safeParse({
      markets: [{ kind: "state", state: "CA" }],
      mortgage: { rateAPR: 0.075, termYears: 30, ltv: 0.75 },
      lotSizeMinSqft: -1,
    });
    expect(negativeLot.success).toBe(false);
  });

  it("exposes the state market kind and lotSizeMinSqft in the Claude tool schema", () => {
    const constraints = PARSE_PROJECT_TOOL.input_schema.properties
      .constraints as {
      properties: {
        markets: { items: { oneOf: Array<{ properties: { kind: { const: string } } }> } };
        lotSizeMinSqft?: { type?: string; minimum?: number };
      };
    };
    const kinds = constraints.properties.markets.items.oneOf.map(
      (v) => v.properties.kind.const,
    );
    expect(kinds).toContain("state");
    expect(kinds).toContain("near");
    expect(constraints.properties.lotSizeMinSqft?.type).toBe("number");
    expect(constraints.properties.lotSizeMinSqft?.minimum).toBe(0);
  });

  it("rejects nonsensical year built and unknown days-on-market tokens", () => {
    const earlyYear = ProjectConstraintsSchema.safeParse({
      markets: [{ kind: "zip", zip: "10001" }],
      mortgage: { rateAPR: 0.075, termYears: 30, ltv: 0.75 },
      yearBuiltMin: 1500,
    });
    expect(earlyYear.success).toBe(false);

    const badRecency = ProjectConstraintsSchema.safeParse({
      markets: [{ kind: "zip", zip: "10001" }],
      mortgage: { rateAPR: 0.075, termYears: 30, ltv: 0.75 },
      daysOnMarketMax: "yesterday",
    });
    expect(badRecency.success).toBe(false);
  });
});
