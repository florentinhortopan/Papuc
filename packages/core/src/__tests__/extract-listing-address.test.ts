import { describe, expect, it } from "vitest";

import { normalizeExtractedListingAddress } from "../llm/extract-listing-address";

describe("normalizeExtractedListingAddress", () => {
  it("builds a keyword and uppercases state", () => {
    const h = normalizeExtractedListingAddress({
      street: "123 Main St",
      city: "Austin",
      state: "tx",
      zip: "78701-1234",
      confidence: "high",
    });
    expect(h).not.toBeNull();
    expect(h!.state).toBe("TX");
    expect(h!.zip).toBe("78701");
    expect(h!.keyword).toBe("123 Main St, Austin, TX, 78701");
    expect(h!.source).toBe("llm");
  });

  it("rejects missing street", () => {
    expect(
      normalizeExtractedListingAddress({
        city: "Austin",
        state: "TX",
        confidence: "low",
      }),
    ).toBeNull();
  });
});
