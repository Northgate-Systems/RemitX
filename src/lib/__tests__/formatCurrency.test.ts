import { describe, expect, it } from "vitest";
import { formatAmount, formatCurrency } from "@/lib/formatCurrency";

describe("formatAmount", () => {
  it("formats a Stellar asset amount to 2 decimals with grouping", () => {
    expect(formatAmount(1234.5, "XLM")).toBe("1,234.50");
  });

  it("accepts a string amount, matching what balances/APIs return", () => {
    expect(formatAmount("42", "USDC")).toBe("42.00");
  });

  it("falls back to 0 for a non-numeric string instead of throwing or printing NaN", () => {
    expect(formatAmount("not-a-number", "XLM")).toBe("0.00");
  });

  it("is case-insensitive on the currency code for decimal lookup", () => {
    expect(formatAmount(1, "xlm")).toBe("1.00");
  });
});

describe("formatCurrency", () => {
  it("renders a Stellar ticker as '<amount> <CODE>'", () => {
    expect(formatCurrency(1234.5, "XLM")).toBe("1,234.50 XLM");
  });

  it("renders any non-fiat ticker the same way, not just XLM", () => {
    expect(formatCurrency(42, "USDC")).toBe("42.00 USDC");
  });

  it("renders a recognized fiat code with a locale currency symbol instead of a suffix", () => {
    expect(formatCurrency(12.3, "USD")).toBe("$12.30");
  });

  it("is case-insensitive on the currency code for fiat detection", () => {
    expect(formatCurrency(12.3, "usd")).toBe("$12.30");
  });

  it("never throws on garbage input, matching formatAmount's zero fallback", () => {
    expect(formatCurrency(NaN, "XLM")).toBe("0.00 XLM");
  });
});
