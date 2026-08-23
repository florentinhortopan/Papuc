import { describe, expect, it } from "vitest";

import { detectPropertyLookupIntent } from "../property-lookup-intent";

describe("detectPropertyLookupIntent", () => {
  it("detects listing URLs", () => {
    const r = detectPropertyLookupIntent(
      "check https://www.redfin.com/TX/Austin/123-Main-St/home/12345 please",
    );
    expect(r?.kind).toBe("url");
    expect(r?.value).toContain("redfin.com");
  });

  it("detects a street address with city/state", () => {
    const r = detectPropertyLookupIntent("123 Main St, Austin, TX 78701");
    expect(r).toEqual({
      kind: "address",
      value: "123 Main St, Austin, TX 78701",
    });
  });

  it("rejects scout-style prompts", () => {
    expect(
      detectPropertyLookupIntent(
        "Find cashflowing 3beds near Austin under $500k",
      ),
    ).toBeNull();
  });

  it("rejects bare city queries", () => {
    expect(detectPropertyLookupIntent("Austin TX")).toBeNull();
  });
});
