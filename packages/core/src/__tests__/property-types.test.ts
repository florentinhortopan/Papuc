import { describe, expect, it } from "vitest";

import {
  PARSE_PROJECT_TOOL,
  PROPERTY_TYPE_LABELS,
  ProjectConstraintsSchema,
  type PropertyType,
} from "../index";

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
  it("accepts bedsMax/bathsMax/sqftMax/yearBuiltMin/daysOnMarketMax", () => {
    const ok = ProjectConstraintsSchema.safeParse({
      markets: [{ kind: "city", city: "Austin", state: "TX" }],
      mortgage: { rateAPR: 0.075, termYears: 30, ltv: 0.75 },
      propertyTypes: ["multi_family_2_4"],
      bedsMax: 6,
      bathsMax: 4,
      sqftMax: 5000,
      yearBuiltMin: 1990,
      daysOnMarketMax: "30d",
    });
    expect(ok.success).toBe(true);
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
