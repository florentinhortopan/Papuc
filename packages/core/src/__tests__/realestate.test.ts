import { describe, expect, it, vi } from "vitest";

import { RealEstateAPIClient, RealEstateAPIError } from "../realestate";

function mockFetch(handler: (url: string, init: RequestInit) => Response | Promise<Response>) {
  return vi.fn(async (input: any, init?: any) => {
    const url = typeof input === "string" ? input : input.url;
    return handler(url, init ?? {});
  }) as unknown as typeof fetch;
}

describe("RealEstateAPIClient", () => {
  it("calls MLSSearch with mapped filters and normalizes results", async () => {
    const fetchFn = mockFetch(async (url, init) => {
      expect(url).toContain("/MLSSearch");
      const body = JSON.parse((init.body as string) ?? "{}");
      expect(body.city).toBe("Berkeley");
      expect(body.state).toBe("CA");
      expect(body.beds_min).toBe(3);
      expect(body.size).toBe(25);
      return new Response(
        JSON.stringify({
          recordCount: 1,
          data: [
            {
              id: "abc",
              address: { fullAddress: "123 Main St", city: "Berkeley", state: "CA" },
              price: 750000,
              beds: 3,
              baths: 2,
              sqft: 1500,
              media: {
                primaryListingImageUrl: "https://cdn/photo.jpg",
                photosCount: 12,
              },
              daysOnMarket: 5,
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });

    const client = new RealEstateAPIClient({ apiKey: "key", fetchFn });
    const res = await client.mlsSearch({ city: "Berkeley", state: "CA", beds_min: 3 });
    expect(res.total).toBe(1);
    expect(res.data).toHaveLength(1);
    const first = res.data[0]!;
    expect(first.id).toBe("abc");
    expect(first.address).toBe("123 Main St");
    expect(first.price).toBe(750000);
    expect(first.primaryListingImageUrl).toBe("https://cdn/photo.jpg");
  });

  it("retries on 429 then succeeds", async () => {
    let calls = 0;
    const fetchFn = mockFetch(async () => {
      calls++;
      if (calls < 2)
        return new Response("rate limited", { status: 429 });
      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    });
    const client = new RealEstateAPIClient({ apiKey: "k", fetchFn, maxRetries: 3 });
    const res = await client.mlsSearch({});
    expect(res.data).toEqual([]);
    expect(calls).toBe(2);
  });

  it("throws RealEstateAPIError on 4xx", async () => {
    const fetchFn = mockFetch(async () => new Response("bad request", { status: 400 }));
    const client = new RealEstateAPIClient({ apiKey: "k", fetchFn, maxRetries: 1 });
    await expect(client.mlsSearch({})).rejects.toBeInstanceOf(RealEstateAPIError);
  });

  it("calls PropertySearch with mapped filters and normalizes property records", async () => {
    const fetchFn = mockFetch(async (url, init) => {
      expect(url).toContain("/PropertySearch");
      const body = JSON.parse((init.body as string) ?? "{}");
      expect(body.city).toBe("Tampa");
      expect(body.state).toBe("FL");
      expect(body.value_min).toBe(150000);
      expect(body.value_max).toBe(300000);
      expect(body.beds_min).toBe(3);
      expect(body.mls_active).toBe(true);
      return new Response(
        JSON.stringify({
          recordCount: 2,
          resultCount: 2,
          data: [
            {
              id: 12345,
              address: { address: "123 Palm St", city: "Tampa", state: "FL", zip: "33602" },
              bedrooms: 3,
              bathrooms: 2,
              squareFeet: 1500,
              estimatedValue: 275000,
              mlsListingPrice: 285000,
              mlsDaysOnMarket: 12,
              imageUrl: "https://cdn/p123.jpg",
            },
            {
              id: 67890,
              address: { address: "456 Bay Dr", city: "Tampa", state: "FL", zip: "33606" },
              bedrooms: 4,
              bathrooms: 3,
              squareFeet: 2100,
              estimatedValue: 220000,
              mlsListingPrice: 0,
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });

    const client = new RealEstateAPIClient({ apiKey: "k", fetchFn });
    const res = await client.propertySearch({
      city: "Tampa",
      state: "FL",
      value_min: 150000,
      value_max: 300000,
      beds_min: 3,
      mls_active: true,
    });

    expect(res.total).toBe(2);
    expect(res.data).toHaveLength(2);

    const listed = res.data[0]!;
    expect(listed.id).toBe("12345");
    expect(listed.address).toBe("123 Palm St");
    expect(listed.price).toBe(285000); // prefers MLS listing price when present
    expect(listed.beds).toBe(3);
    expect(listed.daysOnMarket).toBe(12);
    expect(listed.primaryListingImageUrl).toBe("https://cdn/p123.jpg");

    const offMarket = res.data[1]!;
    expect(offMarket.id).toBe("67890");
    expect(offMarket.price).toBe(220000); // falls back to AVM when no MLS price
  });

  it("normalizes property detail with HUD FMR and suggested rent", async () => {
    const fetchFn = mockFetch(async () => {
      return new Response(
        JSON.stringify({
          data: {
            id: "xyz",
            address: { fullAddress: "456 Oak Ave" },
            estimatedValue: 600000,
            propertyInfo: { bedroomsCount: 4, bathroomsCount: 2.5, livingSquareFeet: 2000, yearBuilt: 1995 },
            demographics: { suggestedRent: "3200", fmrData: { fmr2: 2700, fmr3: 3500 } },
            media: { photosList: [{ url: "https://cdn/p1.jpg" }, { url: "https://cdn/p2.jpg" }] },
          },
        }),
        { status: 200 },
      );
    });
    const client = new RealEstateAPIClient({ apiKey: "k", fetchFn });
    const detail = await client.propertyDetail("xyz");
    expect(detail.id).toBe("xyz");
    expect(detail.estimatedValue).toBe(600000);
    expect(detail.suggestedRent).toBe(3200);
    expect(detail.hudFairMarketRent).toEqual({ fmr2: 2700, fmr3: 3500 });
    expect(detail.beds).toBe(4);
    expect(detail.photos).toEqual(["https://cdn/p1.jpg", "https://cdn/p2.jpg"]);
  });
});
