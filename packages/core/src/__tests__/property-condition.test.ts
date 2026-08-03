import { describe, expect, it } from "vitest";

import { MockLLMProvider } from "../llm/mock";
import { RECORD_PROPERTY_CONDITION_TOOL } from "../llm/prompts";
import {
  CONDITION_DISCLAIMER,
  CONDITION_PHOTO_BATCH_SIZE,
  MAX_CONDITION_PHOTOS,
  aggregateConditionTotals,
  downscaleListingPhotoUrl,
  mergeConditionBatch,
  normalizeConditionPhotoUrls,
  normalizePropertyConditionAssessment,
  selectConditionPhotoUrls,
  sliceConditionPhotoBatch,
} from "../llm/property-condition";

describe("RECORD_PROPERTY_CONDITION_TOOL schema", () => {
  it("keeps the tool schema and normalized output shape in sync", () => {
    const props = RECORD_PROPERTY_CONDITION_TOOL.input_schema.properties as Record<
      string,
      unknown
    >;
    for (const field of [
      "overall",
      "summary",
      "findings",
      "rehabLow",
      "rehabHigh",
      "rehabSuggested",
      "maintenanceMonthlySuggested",
      "disclaimer",
    ]) {
      expect(props, `schema missing ${field}`).toHaveProperty(field);
    }
    expect(RECORD_PROPERTY_CONDITION_TOOL.input_schema.required).toEqual(
      expect.arrayContaining([
        "overall",
        "summary",
        "findings",
        "rehabLow",
        "rehabHigh",
        "rehabSuggested",
        "maintenanceMonthlySuggested",
      ]),
    );
    expect((props.overall as { enum: string[] }).enum.sort()).toEqual(
      [
        "heavy_rehab",
        "light_cosmetic",
        "moderate_rehab",
        "turnkey",
        "unknown",
      ].sort(),
    );
  });
});

describe("selectConditionPhotoUrls / normalize / batching", () => {
  it("dedupes, keeps https only, and caps a single batch at BATCH_SIZE", () => {
    const urls = [
      "https://cdn.example/a.jpg",
      "https://cdn.example/a.jpg",
      "ftp://bad",
      "https://cdn.example/b.jpg",
      ...Array.from({ length: 40 }, (_, i) => `https://cdn.example/p${i}.jpg`),
    ];
    const selected = selectConditionPhotoUrls(urls);
    expect(selected[0]).toBe("https://cdn.example/a.jpg");
    expect(selected).toHaveLength(CONDITION_PHOTO_BATCH_SIZE);
    expect(MAX_CONDITION_PHOTOS).toBe(CONDITION_PHOTO_BATCH_SIZE);
    expect(new Set(selected).size).toBe(selected.length);
  });

  it("normalizeConditionPhotoUrls keeps the full gallery", () => {
    const urls = Array.from(
      { length: 54 },
      (_, i) => `https://cdn.example/p${i}.jpg`,
    );
    expect(normalizeConditionPhotoUrls(urls)).toHaveLength(54);
  });

  it("sliceConditionPhotoBatch walks the full gallery", () => {
    const urls = Array.from(
      { length: 54 },
      (_, i) => `https://cdn.example/p${i}.jpg`,
    );
    const first = sliceConditionPhotoBatch(urls, 0, 10);
    expect(first.batch).toHaveLength(10);
    expect(first.nextCursor).toBe(10);
    expect(first.done).toBe(false);
    const last = sliceConditionPhotoBatch(urls, 50, 10);
    expect(last.batch).toHaveLength(4);
    expect(last.nextCursor).toBe(54);
    expect(last.done).toBe(true);
  });

  it("downscales Zillow cc_ft size tokens", () => {
    expect(
      downscaleListingPhotoUrl(
        "https://photos.zillowstatic.com/fp/abc-cc_ft_1536.webp",
      ),
    ).toBe("https://photos.zillowstatic.com/fp/abc-cc_ft_768.webp");
  });

  it("mergeConditionBatch remaps photo indexes and worsens overall", () => {
    const merged = mergeConditionBatch({
      priorFindings: [],
      priorOverall: "turnkey",
      priorMaintenanceMonthly: 120,
      globalStartIndex: 10,
      batch: {
        overall: "moderate_rehab",
        summary: "Kitchen wear",
        findings: [
          {
            id: "kit-1",
            severity: "major",
            category: "kitchen",
            title: "Dated kitchen",
            detail: "Old cabinets",
            photoIndexes: [0, 1],
            estimatedCostLow: 8000,
            estimatedCostHigh: 15000,
            costBucket: "rehab",
            confidence: "medium",
          },
        ],
        rehabLow: 8000,
        rehabHigh: 15000,
        rehabSuggested: 11000,
        maintenanceMonthlySuggested: 200,
      },
    });
    expect(merged.overall).toBe("moderate_rehab");
    expect(merged.maintenanceMonthlySuggested).toBe(200);
    expect(merged.findings[0]!.photoIndexes).toEqual([10, 11]);
    const totals = aggregateConditionTotals(merged.findings, merged.maintenanceMonthlySuggested);
    expect(totals.rehabSuggested).toBe(11500);
  });
});

describe("normalizePropertyConditionAssessment", () => {
  it("passes through a well-formed payload and defaults disclaimer", () => {
    const a = normalizePropertyConditionAssessment({
      overall: "moderate_rehab",
      summary: "Kitchen and roof need work.",
      findings: [
        {
          id: "roof-1",
          severity: "major",
          category: "roof",
          title: "Aging roof",
          detail: "Curling shingles visible on the street side.",
          photoIndexes: [0, 2],
          estimatedCostLow: 8000,
          estimatedCostHigh: 14000,
          costBucket: "rehab",
          confidence: "medium",
        },
      ],
      rehabLow: 12000,
      rehabHigh: 25000,
      rehabSuggested: 18000,
      maintenanceMonthlySuggested: 250,
    });
    expect(a.overall).toBe("moderate_rehab");
    expect(a.rehabSuggested).toBe(18000);
    expect(a.findings).toHaveLength(1);
    expect(a.findings[0]!.photoIndexes).toEqual([0, 2]);
    expect(a.disclaimer).toBe(CONDITION_DISCLAIMER);
  });

  it("repairs inverted rehab range and unknown enums", () => {
    const a = normalizePropertyConditionAssessment({
      overall: "not-a-real-status",
      summary: "  ",
      findings: [
        {
          severity: "apocalyptic",
          category: "",
          title: "Mystery stain",
          detail: "Could be water.",
          estimatedCostLow: 5000,
          estimatedCostHigh: 1000,
          costBucket: "capex",
          confidence: "maybe",
        },
      ],
      rehabLow: 30000,
      rehabHigh: 10000,
      maintenanceMonthlySuggested: 80,
    });
    expect(a.overall).toBe("unknown");
    expect(a.rehabLow).toBe(10000);
    expect(a.rehabHigh).toBe(30000);
    expect(a.rehabSuggested).toBe(20000);
    expect(a.findings[0]!.severity).toBe("minor");
    expect(a.findings[0]!.costBucket).toBe("none");
    expect(a.findings[0]!.confidence).toBe("low");
    expect(a.findings[0]!.estimatedCostLow).toBe(1000);
    expect(a.findings[0]!.estimatedCostHigh).toBe(5000);
    expect(a.summary.length).toBeGreaterThan(0);
  });
});

describe("MockLLMProvider.analyzePropertyCondition", () => {
  it("returns a light-cosmetic assessment with the standard disclaimer", async () => {
    const llm = new MockLLMProvider();
    const a = await llm.analyzePropertyCondition({
      photoUrls: ["https://cdn.example/1.jpg", "https://cdn.example/2.jpg"],
      price: 400_000,
    });
    expect(a.overall).toBe("light_cosmetic");
    expect(a.rehabSuggested).toBeGreaterThan(0);
    expect(a.maintenanceMonthlySuggested).toBeGreaterThanOrEqual(100);
    expect(a.disclaimer).toBe(CONDITION_DISCLAIMER);
    expect(a.findings.length).toBeGreaterThan(0);
  });

  it("rejects empty photo lists", async () => {
    const llm = new MockLLMProvider();
    await expect(
      llm.analyzePropertyCondition({ photoUrls: [] }),
    ).rejects.toThrow(/no usable photo/);
  });
});
