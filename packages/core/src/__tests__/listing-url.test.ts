import { describe, expect, it } from "vitest";

import {
  extractHomesAddress,
  extractRealtorAddress,
  extractRedfinAddress,
  extractUrlFromText,
  extractZillowZpid,
  parseListingUrl,
} from "../listing-url";

describe("listing-url", () => {
  it("extracts a URL from surrounding text", () => {
    expect(
      extractUrlFromText("check this https://www.zillow.com/homedetails/x/1_zpid/ please"),
    ).toContain("zillow.com");
  });

  it("parses a Zillow homedetails URL and zpid", () => {
    const r = parseListingUrl(
      "https://www.zillow.com/homedetails/302-El-Paso-St-Austin-TX-78704/63838278_zpid/?utm_source=share",
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.platform).toBe("zillow");
    expect(r.zpid).toBe("63838278");
    expect(r.canonicalUrl).not.toContain("utm_source");
    expect(r.addressHint?.state).toBe("TX");
    expect(r.addressHint?.zip).toBe("78704");
  });

  it("rejects unknown hosts", () => {
    const r = parseListingUrl("https://evil.example/listing/1");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("unsupported_host");
  });

  it("parses Redfin property URL + address from slug", () => {
    const r = parseListingUrl(
      "https://www.redfin.com/TX/Austin/123-Main-St/home/12345?utm_source=share",
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.platform).toBe("redfin");
    expect(r.listingId).toBe("12345");
    expect(r.addressHint?.street).toMatch(/123 Main St/i);
    expect(r.addressHint?.city).toBe("Austin");
    expect(r.addressHint?.state).toBe("TX");
    expect(r.canonicalUrl).not.toContain("utm_source");
  });

  it("parses Redfin street with trailing zip", () => {
    const { hint, listingId } = extractRedfinAddress(
      "https://www.redfin.com/CA/San-Francisco/302-El-Paso-St-94110/home/987654",
    );
    expect(listingId).toBe("987654");
    expect(hint?.zip).toBe("94110");
    expect(hint?.street).toMatch(/302 El Paso St/i);
    expect(hint?.city).toBe("San Francisco");
    expect(hint?.confidence).toBe("high");
  });

  it("parses Realtor detail URL", () => {
    const r = parseListingUrl(
      "https://www.realtor.com/realestateandhomes-detail/123-Main-St_Austin_TX_78701_M12345-67890",
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.platform).toBe("realtor");
    expect(r.listingId).toMatch(/^M12345/i);
    expect(r.addressHint?.street).toMatch(/123 Main St/i);
    expect(r.addressHint?.city).toBe("Austin");
    expect(r.addressHint?.state).toBe("TX");
    expect(r.addressHint?.zip).toBe("78701");
  });

  it("parses Realtor with unit segment", () => {
    const { hint } = extractRealtorAddress(
      "https://www.realtor.com/realestateandhomes-detail/123-Oak-Ave_Apt-2_San-Jose_CA_95112_M999-111",
    );
    expect(hint?.city).toBe("San Jose");
    expect(hint?.state).toBe("CA");
    expect(hint?.zip).toBe("95112");
    expect(hint?.street?.toLowerCase()).toContain("oak");
  });

  it("parses Homes.com property URL", () => {
    const r = parseListingUrl(
      "https://www.homes.com/property/123-main-st-austin-tx-78701/abc123/",
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.platform).toBe("homes");
    expect(r.listingId).toBe("abc123");
    expect(r.addressHint?.state).toBe("TX");
    expect(r.addressHint?.zip).toBe("78701");
    expect(r.addressHint?.keyword).toMatch(/123/i);
  });

  it("extractHomesAddress keeps multi-word cities after street suffix", () => {
    const { hint } = extractHomesAddress(
      "https://www.homes.com/property/500-market-st-san-francisco-ca-94105/x",
    );
    expect(hint?.state).toBe("CA");
    expect(hint?.zip).toBe("94105");
    expect(hint?.city).toMatch(/San Francisco/i);
    expect(hint?.street).toMatch(/500 Market St/i);
    expect(hint?.confidence).toBe("medium");
  });

  it("rejects Redfin search pages", () => {
    const r = parseListingUrl("https://www.redfin.com/city/3079/TX/Austin");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("unsupported_platform");
  });

  it("extractZillowZpid handles path forms", () => {
    expect(
      extractZillowZpid(
        "https://www.zillow.com/homedetails/foo/19090483_zpid/",
      ),
    ).toBe("19090483");
  });
});
