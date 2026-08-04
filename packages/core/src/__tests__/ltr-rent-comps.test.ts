import { describe, expect, it } from "vitest";

import {
  aggregateLtrRentComps,
  aggregateLtrRentFromListings,
  buildLtrRentCompFilters,
  extractForRentMonthly,
  LTR_RENT_MIN_COMPS,
  zillowHomeTypeToHasDataFilter,
} from "../ltr-rent-comps";
import type { ZillowListingSummary } from "../hasdata";

describe("zillowHomeTypeToHasDataFilter", () => {
  it("maps common Zillow enums", () => {
    expect(zillowHomeTypeToHasDataFilter("SINGLE_FAMILY")).toBe("house");
    expect(zillowHomeTypeToHasDataFilter("CONDO")).toBe("condo");
    expect(zillowHomeTypeToHasDataFilter("TOWNHOUSE")).toBe("townhome");
    expect(zillowHomeTypeToHasDataFilter("MULTI_FAMILY")).toBe("multiFamily");
  });

  it("rejects land", () => {
    expect(zillowHomeTypeToHasDataFilter("LOT")).toBeNull();
    expect(zillowHomeTypeToHasDataFilter("LAND")).toBeNull();
  });
});

describe("buildLtrRentCompFilters", () => {
  it("uses City, ST keyword and forRent type", () => {
    const f = buildLtrRentCompFilters({
      city: "Austin",
      state: "TX",
      beds: 3,
      homeType: "SINGLE_FAMILY",
    });
    expect(f.type).toBe("forRent");
    expect(f.keyword).toBe("Austin, TX");
    expect(f.bedsMin).toBe(2);
    expect(f.bedsMax).toBe(4);
    expect(f.homeTypes).toEqual(["house"]);
  });

  it("falls back to zip when city is missing", () => {
    const f = buildLtrRentCompFilters({ zip: "78704", state: "TX" });
    expect(f.keyword).toBe("78704");
    expect(f.bedsMin).toBeUndefined();
  });

  it("throws when no location is available", () => {
    expect(() => buildLtrRentCompFilters({})).toThrow(/city\/state or zip/);
  });
});

describe("extractForRentMonthly", () => {
  it("prefers ask price over rentZestimate", () => {
    expect(
      extractForRentMonthly({
        zpid: "1",
        price: 2400,
        rentZestimate: 2200,
      } as ZillowListingSummary),
    ).toBe(2400);
  });

  it("falls back to rentZestimate", () => {
    expect(
      extractForRentMonthly({
        zpid: "1",
        rentZestimate: 2100,
      } as ZillowListingSummary),
    ).toBe(2100);
  });

  it("drops non-positive", () => {
    expect(
      extractForRentMonthly({ zpid: "1", price: 0 } as ZillowListingSummary),
    ).toBeUndefined();
  });
});

describe("aggregateLtrRentComps", () => {
  it("returns null below the minimum sample size", () => {
    expect(aggregateLtrRentComps([1000, 1100])).toBeNull();
    expect(LTR_RENT_MIN_COMPS).toBe(3);
  });

  it("filters zeros and computes median / p25 / p75", () => {
    const stats = aggregateLtrRentComps([
      2000,
      0,
      2200,
      null,
      2400,
      2600,
      undefined,
      3000,
    ]);
    expect(stats).not.toBeNull();
    expect(stats!.comparableCount).toBe(5);
    expect(stats!.median).toBe(2400);
    expect(stats!.p25).toBe(2200);
    expect(stats!.p75).toBe(2600);
  });

  it("aggregates from listing rows", () => {
    const listings: ZillowListingSummary[] = [
      { zpid: "a", price: 1800 },
      { zpid: "b", price: 2000 },
      { zpid: "c", rentZestimate: 2200 },
      { zpid: "d", price: -1 },
    ];
    const stats = aggregateLtrRentFromListings(listings);
    expect(stats?.comparableCount).toBe(3);
    expect(stats?.median).toBe(2000);
  });
});
