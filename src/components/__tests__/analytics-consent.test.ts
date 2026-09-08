import { describe, it, expect } from "vitest";
import { hasAnalyticsConsent } from "../Analytics";

describe("hasAnalyticsConsent", () => {
  it("returns false before the visitor has made any choice (localStorage key not set yet)", () => {
    expect(hasAnalyticsConsent(null)).toBe(false);
  });

  it("returns true only for the exact 'accepted' value CookieBanner writes on Accept All", () => {
    expect(hasAnalyticsConsent("accepted")).toBe(true);
  });

  it("returns false for 'declined' (CookieBanner's Decline button)", () => {
    expect(hasAnalyticsConsent("declined")).toBe(false);
  });

  it("returns false for an empty string", () => {
    expect(hasAnalyticsConsent("")).toBe(false);
  });

  it("is case-sensitive - 'Accepted'/'ACCEPTED' must not be treated as consent", () => {
    expect(hasAnalyticsConsent("Accepted")).toBe(false);
    expect(hasAnalyticsConsent("ACCEPTED")).toBe(false);
  });

  it("returns false for any unexpected/corrupted stored value, failing closed rather than open", () => {
    expect(hasAnalyticsConsent("true")).toBe(false);
    expect(hasAnalyticsConsent("1")).toBe(false);
    expect(hasAnalyticsConsent("undefined")).toBe(false);
  });
});
