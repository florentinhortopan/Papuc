import { describe, expect, it, vi } from "vitest";

import {
  buildZillowParams,
  extractHoaMonthly,
  extractLotSizeSqft,
  extractZillowPhotos,
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
    // The working param is squareFeet[min] — sqft[min] is silently
    // ignored by the API (verified by live probe).
    expect(s).toContain("squareFeet%5Bmin%5D=900");
    expect(s).not.toContain("sqft%5Bmin%5D");
  });

  it("repeats homeTypes[] as an array", () => {
    const p = buildZillowParams({
      keyword: "94703",
      homeTypes: ["SINGLE_FAMILY", "CONDO"],
    });
    const all = p.getAll("homeTypes[]");
    expect(all).toEqual(["SINGLE_FAMILY", "CONDO"]);
  });

  it("passes hoa, yearBuilt and lotSize filters", () => {
    const p = buildZillowParams({
      keyword: "Sacramento, CA",
      hoaMax: 0,
      yearBuiltMin: 1990,
      yearBuiltMax: 2020,
      lotSizeMin: 5000,
    });
    expect(p.get("hoa")).toBe("0");
    expect(p.get("yearBuilt[min]")).toBe("1990");
    expect(p.get("yearBuilt[max]")).toBe("2020");
    expect(p.get("lotSize[min]")).toBe("5000");
  });

  it("omits hoa/yearBuilt/lotSize when not requested", () => {
    const p = buildZillowParams({ keyword: "94703" });
    expect(p.has("hoa")).toBe(false);
    expect(p.has("yearBuilt[min]")).toBe(false);
    expect(p.has("lotSize[min]")).toBe(false);
  });
});

describe("extractLotSizeSqft", () => {
  it("converts acres to sqft at 43,560", () => {
    expect(extractLotSizeSqft({ lotAreaValue: 0.5, lotAreaUnits: "acres" })).toBe(
      21780,
    );
    expect(extractLotSizeSqft({ lotAreaValue: 2, lotAreaUnits: "Acres" })).toBe(
      87120,
    );
  });

  it("passes sqft through unchanged (rounded)", () => {
    expect(
      extractLotSizeSqft({ lotAreaValue: 6534.5, lotAreaUnits: "sqft" }),
    ).toBe(6535);
    expect(
      extractLotSizeSqft({ lotAreaValue: 7000, lotAreaUnits: "Square Feet" }),
    ).toBe(7000);
  });

  it("returns undefined for missing or non-positive values", () => {
    expect(extractLotSizeSqft({})).toBeUndefined();
    expect(extractLotSizeSqft({ lotAreaValue: 0 })).toBeUndefined();
    expect(extractLotSizeSqft({ lotAreaValue: -1 })).toBeUndefined();
    expect(extractLotSizeSqft({ lotAreaValue: "n/a" })).toBeUndefined();
  });

  it("treats unitless values under 100 as acres (bare acreage records)", () => {
    // No US lot is under 100 sqft, so 2.5 without units means 2.5 acres —
    // previously this was read as 2.5 sqft.
    expect(extractLotSizeSqft({ lotAreaValue: 2.5 })).toBe(108_900);
    expect(extractLotSizeSqft({ lotSize: 40.7 })).toBe(1_772_892);
    // Larger bare values are already sqft.
    expect(extractLotSizeSqft({ lotAreaValue: 8000 })).toBe(8000);
  });

  it("parses combined value+unit strings", () => {
    expect(extractLotSizeSqft({ lotSize: "2.5 acres" })).toBe(108_900);
    expect(extractLotSizeSqft({ lotSize: "10,890 sqft" })).toBe(10_890);
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
    expect(out.priceChange).toBeUndefined();
    expect(out.priceChangedAt).toBeUndefined();
    expect(out.lotSizeSqft).toBeUndefined();
    expect(out.hasVirtualTour).toBeUndefined();
  });

  it("handles the 2026-07 HasData shape (address.street, no zpid, status)", () => {
    // Verbatim (trimmed) live response item from 2026-07-29: HasData
    // renamed address.streetAddress → address.street and dropped zpid in
    // favor of id, which nulled every scouted address ("Address pending").
    const out = normalizeZillowListing({
      id: "19090483",
      url: "https://www.zillow.com/homedetails/13293-Driftwood-Vlg-Clearlake-Oaks-CA-95423/19090483_zpid/",
      homeType: "SINGLE_FAMILY",
      status: "FOR_SALE",
      price: 365000,
      priceChange: -34900,
      priceChangedAtIso: "2026-07-29T07:00:00.000Z",
      zestimate: 349400,
      rentZestimate: 1857,
      daysOnZillow: 0,
      area: 1688,
      lotAreaValue: 8712,
      lotAreaUnits: "sqft",
      addressRaw: "13293 Driftwood Vlg, Clearlake Oaks, CA 95423",
      address: {
        street: "13293 Driftwood Vlg",
        city: "Clearlake Oaks",
        state: "CA",
        zipcode: "95423",
      },
      latitude: 39.02256,
      longitude: -122.66136,
      beds: 4,
      baths: 3,
      image: "https://photos.zillowstatic.com/fp/cover.jpg",
      photos: ["a.jpg", "b.jpg"],
      mediaDetails: { has3DModel: false, hasVideo: false },
    });
    expect(out.zpid).toBe("19090483");
    expect(out.address).toBe("13293 Driftwood Vlg");
    expect(out.city).toBe("Clearlake Oaks");
    expect(out.state).toBe("CA");
    expect(out.zip).toBe("95423");
    expect(out.sqft).toBe(1688);
    expect(out.beds).toBe(4);
    expect(out.baths).toBe(3);
    expect(out.homeStatus).toBe("FOR_SALE");
    expect(out.imgSrc).toBe("https://photos.zillowstatic.com/fp/cover.jpg");
    expect(out.detailUrl).toContain("19090483_zpid");
    expect(out.lotSizeSqft).toBe(8712);
    expect(out.priceChange).toBe(-34900);
  });

  it("falls back to addressRaw when the address object has no known street key", () => {
    const out = normalizeZillowListing({
      id: 42,
      address: { city: "Tampa", state: "FL", zipcode: "33606" },
      addressRaw: "456 Oak Ave, Tampa, FL 33606",
    });
    expect(out.address).toBe("456 Oak Ave, Tampa, FL 33606");
    expect(out.city).toBe("Tampa");
  });

  it("reads nested address.addressRaw (property-detail shape) and URL slug", () => {
    const nested = normalizeZillowListing({
      id: "63838278",
      address: {
        addressRaw: "302 El Paso St",
        city: "Austin",
        state: "TX",
        zipcode: "78704",
      },
    });
    expect(nested.address).toBe("302 El Paso St");

    const fromUrl = normalizeZillowListing({
      id: "63838278",
      url: "https://www.zillow.com/homedetails/302-El-Paso-St-Austin-TX-78704/63838278_zpid/",
      address: { city: "Austin", state: "TX", zipcode: "78704" },
    });
    expect(fromUrl.address).toBe("302 El Paso St Austin TX 78704");
  });

  it("extracts price-cut, lot, photo and media signals", () => {
    const out = normalizeZillowListing({
      zpid: 555,
      price: 500000,
      priceChange: -25000,
      priceChangedAtIso: "2026-07-20T00:00:00.000Z",
      lotAreaValue: 0.25,
      lotAreaUnits: "acres",
      photos: ["a.jpg", "b.jpg", "c.jpg"],
      mediaDetails: { has3DModel: true, hasVideo: false },
    });
    expect(out.priceChange).toBe(-25000);
    expect(out.priceChangedAt).toBe("2026-07-20T00:00:00.000Z");
    expect(out.lotSizeSqft).toBe(10890);
    expect(out.photoCount).toBe(3);
    expect(out.hasVirtualTour).toBe(true);
  });

  it("converts epoch-millis priceChangedAt to ISO when no ISO field exists", () => {
    const out = normalizeZillowListing({
      zpid: 556,
      priceChange: -10000,
      priceChangedAt: Date.UTC(2026, 6, 15),
    });
    expect(out.priceChangedAt).toBe("2026-07-15T00:00:00.000Z");
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

  it("derives totalPages/hasNextPage from live pagination shape (nextPage + otherPages)", async () => {
    // HasData's live responses don't include totalPages/totalCount — they
    // return nextPage (URL) and otherPages ({"2": url, ...}). This is the
    // exact shape observed against the real API for "Clearlake Oaks, CA".
    const fetchFn = mockFetch(async () =>
      new Response(
        JSON.stringify({
          requestMetadata: { status: "ok" },
          properties: [{ zpid: 1 }],
          pagination: {
            currentPage: 1,
            nextPage: "https://www.zillow.com/clearlake-oaks-ca/2_p",
            otherPages: { "2": "u2", "3": "u3", "4": "u4", "5": "u5" },
          },
        }),
        { status: 200 },
      ),
    );
    const client = new HasDataClient({ apiKey: "k", fetchFn });
    const res = await client.searchZillow({ keyword: "Clearlake Oaks, CA" });
    expect(res.totalPages).toBe(5);
    expect(res.hasNextPage).toBe(true);
    expect(res.page).toBe(1);
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

describe("HasDataClient.searchZillowAll", () => {
  /** Build a mock that serves N pages of `perPage` listings each, using
   *  the live pagination shape (nextPage URL + otherPages map). zpids are
   *  globally unique per page unless `dupeAcrossPages` is set. */
  function pagedFetch(
    pages: number,
    perPage: number,
    opts: { dupeAcrossPages?: boolean } = {},
  ) {
    const calls: number[] = [];
    const fetchFn = mockFetch(async (url) => {
      const m = /[?&]page=(\d+)/.exec(url);
      const page = m ? Number(m[1]) : 1;
      calls.push(page);
      const props = Array.from({ length: perPage }, (_, i) => ({
        zpid: opts.dupeAcrossPages ? i + 1 : (page - 1) * perPage + i + 1,
        price: 100000 + i,
      }));
      const otherPages: Record<string, string> = {};
      for (let p = 1; p <= pages; p++) {
        if (p !== page) otherPages[String(p)] = `u${p}`;
      }
      return new Response(
        JSON.stringify({
          requestMetadata: { status: "ok" },
          properties: props,
          pagination: {
            currentPage: page,
            ...(page < pages ? { nextPage: `u${page + 1}` } : {}),
            otherPages,
          },
        }),
        { status: 200 },
      );
    });
    return { fetchFn, calls };
  }

  it("aggregates multiple pages, de-duped by zpid", async () => {
    const { fetchFn, calls } = pagedFetch(3, 5);
    const client = new HasDataClient({ apiKey: "k", fetchFn });
    const res = await client.searchZillowAll(
      { keyword: "95423" },
      { maxPages: 3 },
    );
    expect(calls).toEqual([1, 2, 3]);
    expect(res.resultCount).toBe(15);
    expect(res.pagesFetched).toBe(3);
    expect(new Set(res.data.map((d) => d.zpid)).size).toBe(15);
  });

  it("stops early once targetCount unique listings are collected", async () => {
    const { fetchFn, calls } = pagedFetch(5, 41);
    const client = new HasDataClient({ apiKey: "k", fetchFn });
    const res = await client.searchZillowAll(
      { keyword: "95423" },
      { maxPages: 5, targetCount: 50 },
    );
    // 41 on page 1 < 50, so page 2 is needed; 82 ≥ 50 stops there.
    expect(calls).toEqual([1, 2]);
    expect(res.resultCount).toBe(82);
    expect(res.pagesFetched).toBe(2);
  });

  it("stops when the upstream reports no next page", async () => {
    const { fetchFn, calls } = pagedFetch(2, 4);
    const client = new HasDataClient({ apiKey: "k", fetchFn });
    const res = await client.searchZillowAll(
      { keyword: "95423" },
      { maxPages: 10 },
    );
    expect(calls).toEqual([1, 2]);
    expect(res.resultCount).toBe(8);
  });

  it("drops duplicate zpids repeated across pages", async () => {
    const { fetchFn } = pagedFetch(3, 5, { dupeAcrossPages: true });
    const client = new HasDataClient({ apiKey: "k", fetchFn });
    const res = await client.searchZillowAll(
      { keyword: "95423" },
      { maxPages: 3 },
    );
    // Every page returns the same 5 zpids → aggregate stays at 5.
    expect(res.resultCount).toBe(5);
    expect(res.pagesFetched).toBe(3);
  });

  it("respects maxPages as a hard cap on credit spend", async () => {
    const { fetchFn, calls } = pagedFetch(10, 41);
    const client = new HasDataClient({ apiKey: "k", fetchFn });
    await client.searchZillowAll({ keyword: "95423" }, { maxPages: 2 });
    expect(calls).toEqual([1, 2]);
  });
});

describe("extractZillowPhotos", () => {
  it("pulls .photos[].url, de-duped and ordered", () => {
    const photos = extractZillowPhotos({
      photos: [
        { url: "https://cdn/a.jpg" },
        { url: "https://cdn/b.jpg" },
        { url: "https://cdn/a.jpg" },
      ],
    });
    expect(photos).toEqual(["https://cdn/a.jpg", "https://cdn/b.jpg"]);
  });

  it("falls back to .images string array when .photos is absent", () => {
    const photos = extractZillowPhotos({
      images: ["https://cdn/x.jpg", "https://cdn/y.jpg"],
    });
    expect(photos).toEqual(["https://cdn/x.jpg", "https://cdn/y.jpg"]);
  });

  it("walks .originalPhotos[].mixedSources.jpeg and picks the widest", () => {
    const photos = extractZillowPhotos({
      originalPhotos: [
        {
          mixedSources: {
            jpeg: [
              { url: "https://cdn/sm.jpg", width: 384 },
              { url: "https://cdn/lg.jpg", width: 1536 },
              { url: "https://cdn/md.jpg", width: 768 },
            ],
          },
        },
      ],
    });
    expect(photos).toEqual(["https://cdn/lg.jpg"]);
  });

  it("falls back to imgSrc as a last resort", () => {
    expect(extractZillowPhotos({ imgSrc: "https://cdn/cover.jpg" })).toEqual([
      "https://cdn/cover.jpg",
    ]);
  });
});

describe("HasDataClient.getZillowProperty", () => {
  it("calls /scrape/zillow/property with the URL and returns the photo array", async () => {
    const fetchFn = mockFetch(async (url) => {
      expect(url).toContain("/scrape/zillow/property");
      expect(url).toContain(encodeURIComponent("https://www.zillow.com/homedetails/x/123_zpid/"));
      return new Response(
        JSON.stringify({
          requestMetadata: { status: "ok", id: "req-2" },
          property: {
            zpid: 123,
            url: "https://www.zillow.com/homedetails/x/123_zpid/",
            address: { streetAddress: "9 Test Ln", city: "Brooklyn", state: "NY", zipcode: "11215" },
            price: 1100000,
            bedrooms: 3,
            bathrooms: 2,
            livingArea: 1400,
            photos: [
              { url: "https://cdn/p1.jpg" },
              { url: "https://cdn/p2.jpg" },
              { url: "https://cdn/p3.jpg" },
            ],
            yearBuilt: 1925,
          },
        }),
        { status: 200 },
      );
    });

    const client = new HasDataClient({ apiKey: "k", fetchFn });
    const detail = await client.getZillowProperty(
      "https://www.zillow.com/homedetails/x/123_zpid/",
    );

    expect(detail.zpid).toBe("123");
    expect(detail.address).toBe("9 Test Ln");
    expect(detail.price).toBe(1100000);
    expect(detail.beds).toBe(3);
    expect(detail.photos).toEqual([
      "https://cdn/p1.jpg",
      "https://cdn/p2.jpg",
      "https://cdn/p3.jpg",
    ]);
    expect(detail.yearBuilt).toBe(1925);
  });

  it("rejects URLs that aren't http(s)", async () => {
    const client = new HasDataClient({ apiKey: "k", fetchFn: mockFetch(async () => new Response("")) });
    await expect(client.getZillowProperty("not-a-url")).rejects.toThrow();
  });
});

describe("extractHoaMonthly", () => {
  it("reads top-level monthlyHoaFee verbatim", () => {
    expect(extractHoaMonthly({ monthlyHoaFee: 250 })).toBe(250);
  });

  it("converts annual hoaFee with frequency to monthly", () => {
    expect(extractHoaMonthly({ hoaFee: 1200, hoaFeeFrequency: "Annually" })).toBe(100);
  });

  it("parses a string like '$300/month'", () => {
    expect(extractHoaMonthly({ hoaFee: "$300/month" })).toBe(300);
  });

  it("parses '1500/year' as 125/mo", () => {
    expect(extractHoaMonthly({ hoaFee: "1500/year" })).toBe(125);
  });

  it("treats 'none' string as $0/mo", () => {
    expect(extractHoaMonthly({ hoaFee: "None" })).toBe(0);
  });

  it("falls back to resoFacts.monthlyHoaFee", () => {
    expect(
      extractHoaMonthly({ resoFacts: { monthlyHoaFee: 175 } }),
    ).toBe(175);
  });

  it("reads from hdpData.homeInfo.monthlyHoaFee", () => {
    expect(
      extractHoaMonthly({ hdpData: { homeInfo: { monthlyHoaFee: 90 } } }),
    ).toBe(90);
  });

  it("returns 0 when hasAssociation is explicitly false", () => {
    expect(extractHoaMonthly({ hasAssociation: false })).toBe(0);
  });

  it("returns undefined when nothing usable is present", () => {
    expect(extractHoaMonthly({ price: 500000 })).toBeUndefined();
  });
});
