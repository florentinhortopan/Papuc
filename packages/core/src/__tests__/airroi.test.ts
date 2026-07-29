import { describe, expect, it, vi } from "vitest";

import {
  AirRoiClient,
  AirRoiError,
  defaultGuestsForBedrooms,
  normalizeAirRoiEstimate,
} from "../airroi";

const FULL_RESPONSE = {
  currency: "usd",
  revenue: 62000,
  average_daily_rate: 245,
  occupancy: 0.68,
  percentiles: {
    revenue: { avg: 62000, p25: 41000, p50: 58000, p75: 74000, p90: 91000 },
    average_daily_rate: { avg: 245, p25: 190, p50: 240, p75: 290, p90: 340 },
    occupancy: { avg: 0.68, p25: 0.52, p50: 0.66, p75: 0.78, p90: 0.88 },
  },
  monthly_revenue_distributions: [
    0.05, 0.05, 0.06, 0.08, 0.1, 0.12, 0.13, 0.12, 0.1, 0.08, 0.06, 0.05,
  ],
  comparable_listings: [{ id: "a" }, { id: "b" }, { id: "c" }],
};

describe("normalizeAirRoiEstimate", () => {
  it("normalizes a full response", () => {
    const e = normalizeAirRoiEstimate(FULL_RESPONSE);
    expect(e.adr).toBe(245);
    expect(e.occupancy).toBe(0.68);
    expect(e.annualRevenue).toBe(62000);
    expect(e.percentiles.adr).toEqual({
      avg: 245,
      p25: 190,
      p50: 240,
      p75: 290,
      p90: 340,
    });
    expect(e.monthlyRevenueDistribution).toHaveLength(12);
    expect(e.comparableCount).toBe(3);
    expect(e.currency).toBe("usd");
  });

  it("throws when ADR or occupancy is missing (paid call returned nothing usable)", () => {
    expect(() => normalizeAirRoiEstimate({ revenue: 50000 })).toThrow(
      /missing average_daily_rate/,
    );
    expect(() =>
      normalizeAirRoiEstimate({ average_daily_rate: 200 }),
    ).toThrow();
  });

  it("repairs percent-form occupancy", () => {
    const e = normalizeAirRoiEstimate({
      average_daily_rate: 200,
      occupancy: 68,
    });
    expect(e.occupancy).toBeCloseTo(0.68, 5);
  });

  it("derives annual revenue when absent", () => {
    const e = normalizeAirRoiEstimate({
      average_daily_rate: 200,
      occupancy: 0.5,
    });
    expect(e.annualRevenue).toBeCloseTo(200 * 365 * 0.5);
  });

  it("drops malformed distributions and partial percentiles", () => {
    const e = normalizeAirRoiEstimate({
      average_daily_rate: 200,
      occupancy: 0.5,
      monthly_revenue_distributions: [0.5, 0.5],
      percentiles: { average_daily_rate: { p50: "n/a" } },
    });
    expect(e.monthlyRevenueDistribution).toBeUndefined();
    expect(e.percentiles.adr).toBeUndefined();
  });
});

describe("defaultGuestsForBedrooms", () => {
  it("sleeps two per bedroom", () => {
    expect(defaultGuestsForBedrooms(3)).toBe(6);
  });
  it("studios sleep 2", () => {
    expect(defaultGuestsForBedrooms(0)).toBe(2);
  });
  it("caps at 16", () => {
    expect(defaultGuestsForBedrooms(12)).toBe(16);
  });
});

describe("AirRoiClient.estimateRevenue", () => {
  function mockFetch(body: unknown, status = 200) {
    return vi.fn(async () => ({
      ok: status >= 200 && status < 300,
      status,
      text: async () => JSON.stringify(body),
    })) as unknown as typeof fetch;
  }

  it("builds the request with address, repaired baths/guests, and api key header", async () => {
    const fetchFn = mockFetch(FULL_RESPONSE);
    const client = new AirRoiClient({ apiKey: "k", fetchFn });
    const e = await client.estimateRevenue({
      address: "9865 E Highway 20, Clearlake Oaks, CA 95423",
      bedrooms: 3,
      baths: 0, // repaired up to the API minimum of 0.5
    });
    expect(e.adr).toBe(245);

    const [url, init] = (fetchFn as any).mock.calls[0];
    const parsed = new URL(url);
    expect(parsed.pathname).toBe("/calculator/estimate");
    expect(parsed.searchParams.get("address")).toContain("Clearlake Oaks");
    expect(parsed.searchParams.get("bedrooms")).toBe("3");
    expect(parsed.searchParams.get("baths")).toBe("1"); // falsy 0 → default 1
    expect(parsed.searchParams.get("guests")).toBe("6"); // 3 beds × 2
    expect(init.headers["x-api-key"]).toBe("k");
  });

  it("uses lat/lng when no address is given", async () => {
    const fetchFn = mockFetch(FULL_RESPONSE);
    const client = new AirRoiClient({ apiKey: "k", fetchFn });
    await client.estimateRevenue({ lat: 39.02, lng: -122.67, bedrooms: 2, baths: 1 });
    const [url] = (fetchFn as any).mock.calls[0];
    const parsed = new URL(url);
    expect(parsed.searchParams.get("lat")).toBe("39.02");
    expect(parsed.searchParams.get("lng")).toBe("-122.67");
    expect(parsed.searchParams.has("address")).toBe(false);
  });

  it("rejects when neither address nor coordinates are provided", async () => {
    const client = new AirRoiClient({ apiKey: "k", fetchFn: mockFetch({}) });
    await expect(
      client.estimateRevenue({ bedrooms: 2, baths: 1 }),
    ).rejects.toThrow(/address or lat\+lng/);
  });

  it("wraps API errors with status code", async () => {
    const client = new AirRoiClient({
      apiKey: "k",
      fetchFn: mockFetch({ error: "insufficient balance" }, 402),
    });
    await expect(
      client.estimateRevenue({ address: "x", bedrooms: 1, baths: 1 }),
    ).rejects.toThrow(AirRoiError);
  });
});
