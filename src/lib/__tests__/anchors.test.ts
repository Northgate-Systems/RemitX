import { describe, it, expect } from "vitest";
import { ANCHORS, listAnchors, estimateFee } from "../anchors";

describe("listAnchors", () => {
  it("returns every anchor sorted ascending by feePercent when called with no filters", () => {
    const result = listAnchors();
    expect(result.map((a) => a.id)).toEqual(["tempo", "vibrant", "cowrie", "anclap"]);
    expect(result).toHaveLength(ANCHORS.length);
  });

  it("treats corridor: 'All' the same as no filter", () => {
    expect(listAnchors({ corridor: "All" }).map((a) => a.id)).toEqual(
      listAnchors().map((a) => a.id)
    );
  });

  it("filters by country via the corridor param, case-insensitively", () => {
    expect(listAnchors({ corridor: "Nigeria" }).map((a) => a.id)).toEqual(["cowrie"]);
    expect(listAnchors({ corridor: "nigeria" }).map((a) => a.id)).toEqual(["cowrie"]);
    expect(listAnchors({ corridor: "NIGERIA" }).map((a) => a.id)).toEqual(["cowrie"]);
  });

  it("filters by exact assetCode", () => {
    expect(listAnchors({ assetCode: "EURC" }).map((a) => a.id)).toEqual(["tempo"]);
    expect(listAnchors({ assetCode: "USDC" }).map((a) => a.id)).toEqual(["vibrant", "cowrie", "anclap"]);
  });

  it("combines corridor and assetCode filters (AND, not OR)", () => {
    // Nigeria's only anchor is USDC, so asking for Nigeria + EURC matches nothing.
    expect(listAnchors({ corridor: "Nigeria", assetCode: "EURC" })).toEqual([]);
    expect(listAnchors({ corridor: "Nigeria", assetCode: "USDC" }).map((a) => a.id)).toEqual(["cowrie"]);
  });

  it("returns an empty array (not an error) for a corridor/country with no matching anchor", () => {
    expect(listAnchors({ corridor: "Atlantis" })).toEqual([]);
  });

  it("returns an empty array (not an error) for an unrecognized assetCode", () => {
    expect(listAnchors({ assetCode: "XYZ" })).toEqual([]);
  });

  it("edge case: filtering by the literal `corridor` field value (not the country name) matches nothing", () => {
    // listAnchors's `corridor` param is actually matched against `Anchor.country`
    // (see the .filter() body), not against `Anchor.corridor` itself. The UI only
    // ever sends the country name (src/app/(app)/anchors/page.tsx sets
    // params.set("corridor", country)), so this never bites in practice - but
    // passing the display string straight from the data (e.g. "NGN (Nigeria)")
    // silently returns zero results instead of matching Cowrie, which is worth
    // a regression test given how easy it'd be to wire a new caller up wrong.
    expect(listAnchors({ corridor: "NGN (Nigeria)" })).toEqual([]);
  });

  it("does not mutate the underlying ANCHORS array or its order across repeated calls", () => {
    const before = ANCHORS.map((a) => a.id);
    listAnchors({ corridor: "Nigeria" });
    listAnchors();
    expect(ANCHORS.map((a) => a.id)).toEqual(before);
  });
});

describe("estimateFee", () => {
  it("computes the fee as amount * feePercent / 100, rounded to 2 decimals", () => {
    const anchor = ANCHORS.find((a) => a.id === "vibrant")!; // 0.5%
    expect(estimateFee(anchor, 1000)).toBe(5);
  });

  it("rounds to the nearest cent instead of leaving floating-point noise", () => {
    const anchor = ANCHORS.find((a) => a.id === "anclap")!; // 1.2%
    // 333.33 * 1.2 / 100 = 3.9999600000000003 unrounded
    expect(estimateFee(anchor, 333.33)).toBe(4);
  });

  it("returns 0 for a zero amount", () => {
    const anchor = ANCHORS.find((a) => a.id === "cowrie")!;
    expect(estimateFee(anchor, 0)).toBe(0);
  });

  it("scales linearly with amount", () => {
    const anchor = ANCHORS.find((a) => a.id === "tempo")!; // 0.35%
    expect(estimateFee(anchor, 200)).toBeCloseTo(estimateFee(anchor, 100) * 2, 5);
  });
});
