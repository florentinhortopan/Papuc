import { describe, expect, it } from "vitest";

import type { ListingAddressHint } from "../listing-url";
import {
  pickZillowAddressMatch,
  scoreZillowAddressMatch,
} from "../zillow-address-match";

const hint: ListingAddressHint = {
  street: "123 Main St",
  city: "Austin",
  state: "TX",
  zip: "78701",
  keyword: "123 Main St, Austin, TX, 78701",
  source: "slug",
  confidence: "high",
};

describe("pickZillowAddressMatch", () => {
  it("picks a clear single match", () => {
    const pick = pickZillowAddressMatch(
      [
        {
          zpid: "1",
          address: "123 Main St",
          city: "Austin",
          state: "TX",
          zip: "78701",
          detailUrl: "https://www.zillow.com/homedetails/x/1_zpid/",
        },
        {
          zpid: "2",
          address: "999 Other Rd",
          city: "Austin",
          state: "TX",
          zip: "78702",
          detailUrl: "https://www.zillow.com/homedetails/y/2_zpid/",
        },
      ],
      hint,
    );
    expect(pick.ok).toBe(true);
    if (!pick.ok) return;
    expect(pick.hit.zpid).toBe("1");
  });

  it("rejects wrong house number", () => {
    expect(
      scoreZillowAddressMatch(
        {
          zpid: "9",
          address: "456 Main St",
          city: "Austin",
          state: "TX",
          zip: "78701",
        },
        hint,
      ),
    ).toBe(-1);
  });

  it("flags ambiguous near-ties", () => {
    const pick = pickZillowAddressMatch(
      [
        {
          zpid: "1",
          address: "123 Main St",
          city: "Austin",
          state: "TX",
          zip: "78701",
          detailUrl: "https://zillow.com/a",
        },
        {
          zpid: "2",
          address: "123 Main Street",
          city: "Austin",
          state: "TX",
          zip: "78701",
          detailUrl: "https://zillow.com/b",
        },
      ],
      hint,
    );
    expect(pick.ok).toBe(false);
    if (pick.ok) return;
    expect(pick.reason).toBe("ambiguous");
  });
});
