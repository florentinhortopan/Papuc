import { describe, expect, it, vi } from "vitest";

import {
  buildZillowParams,
  HasDataClient,
  HasDataError,
  normalizeZillowListing,
} from "../hasdata";

function mockFetch(handler: (url: string, init: RequestInit) => Response | Promise<Response>) {
  return vi.fn(async (input: any, init?: any) => {
    const url = typeof input === "string" ? input : input.url;
    return handler(url, init ?? {});
  }) as unknown as typeof fetch;
}

describe("buildZillowParams", () => {
  it("uses bracketed keys for range filters", () => {
    const p = buildZillowParams({
      keyword: "Brooklyn, NY",
      type: "forSale",
      priceMin: 800000,
      priceMax: 2000000,
      bedsMin: 2,
      sqftMin: 900,
    });
    const s = p.toString();
    expect(s).toContain("keyword=Brooklyn%2C+NY");
    expect(s).toContain("type=forSale");
    expect(s).toContain("price%5Bmin%5D=800000");
    expect(s).toContain("price%5Bmax%5D=2000000");
    expect(s).toContain("beds%5Bmin%5D=2");
    expect(s).toContain("sqft%5Bmin%5D=900");
  });

  it("repeats homeTypes[] as an array", () => {
    const p = buildZillowParams({
      keyword: "94703",
      homeTypes: ["SINGLE_FAMILY", "CONDO"],
    });
    const all = p.getAll("homeTypes[]");
    expect(all).toEqual(["SINGLE_FAMILY", "CONDO"]);
  });
});

describe("normalizeZillowListing", () => {
  it("flattens nested address and pulls rentZestimate", () => {
    const row = {
      zpid: 12345,
      address: { streetAddress: "123 Main St", city: "Brooklyn", state: "NY", zipcode: "11215" },
      price: 1250000,
      zestimate: 1230000,
      rentZestimate: 4200,
      bedrooms: 3,
      bathrooms: 2,
      livingArea: 1450,
      homeType: "SINGLE_FAMILY",
      homeStatus: "FOR_SALE",
      daysOnZillow: 7,
      imgSrc: "https://photos.zillowstatic.com/x.jpg",
      detailUrl: "https://www.zillow.com/homedetails/x_zpid/",
      latitude: 40.6,
      longitude: -73.97,
    };
    const out = normalizeZillowListing(row);
    expect(out.zpid).toBe("12345");
    expect(out.address).toBe("123 Main St");
    expect(out.city).toBe("Brooklyn");
    expect(out.zip).toBe("11215");
    expect(out.price).toBe(1250000);
    expect(out.zestimate).toBe(1230000);
    expect(out.rentZestimate).toBe(4200);
    expect(out.beds).toBe(3);
    expect(out.sqft).toBe(1450);
    expect(out.imgSrc).toBe("https://photos.zillowstatic.com/x.jpg");
    expect(out.lat).toBe(40.6);
  });

  it("handles string-form address and missing fields gracefully", () => {
    const out = normalizeZillowListing({ zpid: 999, address: "456 Oak Ave, Tampa, FL 33606" });
    expect(out.zpid).toBe("999");
    expect(out.address).toBe("456 Oak Ave, Tampa, FL 33606");
    expect(out.beds).toBeUndefined();
    expect(out.rentZestimate).toBeUndefined();
  });

  it("strips $ and commas from string-form numbers", () => {
    const out = normalizeZillowListing({ zpid: 1, price: "$1,250,000", livingArea: "1,450" });
    expect(out.price).toBe(1250000);
    expect(out.sqft).toBe(1450);
  });
});

describe("HasDataClient.searchZillow", () => {
  it("calls /scrape/zillow/listing with x-api-key and bracketed filters, returns properties[]", async () => {
    const fetchFn = mockFetch(async (url, init) => {
      expect(url).toContain("/scrape/zillow/listing");
      expect(url).toContain("price%5Bmin%5D=500000");
      expect(url).toContain("beds%5Bmin%5D=2");
      const headers = init.headers as Record<string, string>;
      expect(headers["x-api-key"]).toBe("hd-key");
      return new Response(
        JSON.stringify({
          requestMetadata: { status: "ok", id: "req-1", url },
          properties: [
            {
              zpid: 111,
              address: { streetAddress: "1 First St", city: "Brooklyn", state: "NY", zipcode: "11201" },
              price: 950000,
              zestimate: 970000,
              rentZestimate: 3800,
              bedrooms: 2,
              bathrooms: 1,
              livingArea: 850,
              homeStatus: "FOR_SALE",
              imgSrc: "https://cdn/p.jpg",
            },
          ],
          pagination: { currentPage: 1, totalPages: 1, totalCount: 1 },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });

    const client = new HasDataClient({ apiKey: "hd-key", fetchFn });
    const res = await client.searchZillow({
      keyword: "Brooklyn, NY",
      type: "forSale",
      priceMin: 500000,
      bedsMin: 2,
    });

    expect(res.total).toBe(1);
    expect(res.data).toHaveLength(1);
    const first = res.data[0]!;
    expect(first.zpid).toBe("111");
    expect(first.price).toBe(950000);
    expect(first.rentZestimate).toBe(3800);
    expect(first.zestimate).toBe(970000);
    expect(first.imgSrc).toBe("https://cdn/p.jpg");
  });

  it("treats requestMetadata.status !== 'ok' as an error", async () => {
    const fetchFn = mockFetch(
      async () =>
        new Response(
          JSON.stringify({
            requestMetadata: { status: "error", id: "req-x" },
            properties: [],
          }),
          { status: 200 },
        ),
    );
    const client = new HasDataClient({ apiKey: "k", fetchFn, maxRetries: 1 });
    await expect(
      client.searchZillow({ keyword: "Tampa, FL" }),
    ).rejects.toBeInstanceOf(HasDataError);
  });

  it("retries on 429 then succeeds", async () => {
    let calls = 0;
    const fetchFn = mockFetch(async () => {
      calls++;
      if (calls < 2) return new Response("rate limited", { status: 429 });
      return new Response(
        JSON.stringify({ requestMetadata: { status: "ok" }, properties: [] }),
        { status: 200 },
      );
    });
    const client = new HasDataClient({ apiKey: "k", fetchFn, maxRetries: 3 });
    const res = await client.searchZillow({ keyword: "94703" });
    expect(res.data).toEqual([]);
    expect(calls).toBe(2);
  });

  it("does NOT retry on 4xx — surfaces HasDataError immediately", async () => {
    let calls = 0;
    const fetchFn = mockFetch(async () => {
      calls++;
      return new Response("bad", { status: 400 });
    });
    const client = new HasDataClient({ apiKey: "k", fetchFn, maxRetries: 3 });
    await expect(client.searchZillow({ keyword: "x" })).rejects.toBeInstanceOf(
      HasDataError,
    );
    expect(calls).toBe(1);
  });
});
