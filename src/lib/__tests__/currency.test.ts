import { describe, it, expect } from "vitest";
import {
  isPlainDecimal,
  toMinorUnits,
  fromMinorUnits,
  convertMinorUnits,
  sanitizeAmountInput,
} from "@/lib/currency";

describe("isPlainDecimal", () => {
  it("accepts a whole number", () => {
    expect(isPlainDecimal("100")).toBe(true);
  });

  it("accepts a number with a decimal part", () => {
    expect(isPlainDecimal("100.50")).toBe(true);
  });

  it("rejects a negative number", () => {
    expect(isPlainDecimal("-5")).toBe(false);
  });

  it("rejects scientific notation", () => {
    expect(isPlainDecimal("1e5")).toBe(false);
  });

  it("rejects an empty string", () => {
    expect(isPlainDecimal("")).toBe(false);
  });

  it("rejects non-numeric text", () => {
    expect(isPlainDecimal("abc")).toBe(false);
  });
});

describe("toMinorUnits", () => {
  it("converts a whole number", () => {
    expect(toMinorUnits("100")).toBe(10000);
  });

  it("converts a two-decimal amount exactly", () => {
    expect(toMinorUnits("100.50")).toBe(10050);
  });

  it("pads a single-decimal amount", () => {
    expect(toMinorUnits("1.5")).toBe(150);
  });

  it("handles a value that famously loses precision through parseFloat, exactly", () => {
    // (1.005).toFixed(2) === "1.00" in every JS engine, because 1.005
    // can't be represented exactly in binary floating point. Going
    // through toMinorUnits never parses "1.00" as a float at all, so
    // there's nothing here for that bug to affect.
    expect(toMinorUnits("1.00")).toBe(100);
  });

  it("returns null for more fractional digits than the currency supports", () => {
    expect(toMinorUnits("1.005")).toBeNull();
  });

  it("returns null for a negative amount", () => {
    expect(toMinorUnits("-5")).toBeNull();
  });

  it("returns null for scientific notation", () => {
    expect(toMinorUnits("1e5")).toBeNull();
  });

  it("returns null for garbage input", () => {
    expect(toMinorUnits("not-a-number")).toBeNull();
  });

  it("returns null for an empty string", () => {
    expect(toMinorUnits("")).toBeNull();
  });

  it("respects a custom decimals argument", () => {
    expect(toMinorUnits("1.5000000", 7)).toBe(15000000);
  });

  it("zero is a valid amount", () => {
    expect(toMinorUnits("0")).toBe(0);
    expect(toMinorUnits("0.00")).toBe(0);
  });
});

describe("fromMinorUnits", () => {
  it("is the inverse of toMinorUnits for a round amount", () => {
    expect(fromMinorUnits(10000)).toBe("100.00");
  });

  it("pads a small fractional amount", () => {
    expect(fromMinorUnits(1)).toBe("0.01");
  });

  it("formats zero", () => {
    expect(fromMinorUnits(0)).toBe("0.00");
  });

  it("round-trips through toMinorUnits for an arbitrary amount", () => {
    const original = "42.37";
    expect(fromMinorUnits(toMinorUnits(original)!)).toBe(original);
  });

  it("supports zero decimals", () => {
    expect(fromMinorUnits(42, 0)).toBe("42");
  });
});

describe("convertMinorUnits", () => {
  it("converts an exact amount by a simple rate", () => {
    // 1.01 send -> 101 minor units, times a 1.50 rate -> 151.5, rounds to 152.
    expect(convertMinorUnits(101, 1.5)).toBe(152);
  });

  it("handles a zero amount", () => {
    expect(convertMinorUnits(0, 1.2345)).toBe(0);
  });

  it("handles a rate below 1 (fee-like conversion)", () => {
    expect(convertMinorUnits(10000, 0.99)).toBe(9900);
  });
});

describe("sanitizeAmountInput", () => {
  it("leaves a well-formed amount untouched", () => {
    expect(sanitizeAmountInput("100.50")).toBe("100.50");
  });

  it("strips non-digit, non-dot characters", () => {
    expect(sanitizeAmountInput("1e5")).toBe("15");
  });

  it("strips a leading minus sign", () => {
    expect(sanitizeAmountInput("-5")).toBe("5");
  });

  it("collapses multiple decimal points to the first one", () => {
    expect(sanitizeAmountInput("1.2.3")).toBe("1.23");
  });

  it("truncates extra fractional digits beyond the given precision", () => {
    expect(sanitizeAmountInput("1.23456")).toBe("1.23");
  });

  it("supports a custom decimals argument", () => {
    expect(sanitizeAmountInput("1.2345678", 7)).toBe("1.2345678");
  });

  it("drops the fractional part entirely when decimals is 0", () => {
    expect(sanitizeAmountInput("1.99", 0)).toBe("1");
  });
});
