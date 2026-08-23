import { describe, expect, it } from "vitest";

import {
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
  });

  it("rejects unknown hosts", () => {
    const r = parseListingUrl("https://evil.example/listing/1");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("unsupported_host");
  });

  it("recognizes Redfin but marks unsupported for MVP resolve", () => {
    const r = parseListingUrl("https://www.redfin.com/TX/Austin/123-Main-St/home/12345");
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
