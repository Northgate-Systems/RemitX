import { describe, it, expect } from "vitest";
import { isDisposableEmailDomain, DISPOSABLE_EMAIL_DOMAINS } from "@/lib/disposable-email-domains";

describe("isDisposableEmailDomain", () => {
  it("flags a known disposable domain", () => {
    expect(isDisposableEmailDomain("someone@mailinator.com")).toBe(true);
  });

  it("is case-insensitive on the domain", () => {
    expect(isDisposableEmailDomain("someone@Mailinator.COM")).toBe(true);
  });

  it("does not flag a normal email provider", () => {
    expect(isDisposableEmailDomain("bohdan@gmail.com")).toBe(false);
  });

  it("does not flag a normal company domain", () => {
    expect(isDisposableEmailDomain("bohdan@example.com")).toBe(false);
  });

  it("only matches the domain, not a lookalike subdomain of a real provider", () => {
    // "mailinator.com.example.org" is NOT mailinator.com - don't over-match.
    expect(isDisposableEmailDomain("someone@mailinator.com.example.org")).toBe(false);
  });

  it("returns false rather than throwing on malformed input without an @", () => {
    expect(isDisposableEmailDomain("not-an-email")).toBe(false);
  });

  it("returns false for an email with nothing after the @", () => {
    expect(isDisposableEmailDomain("someone@")).toBe(false);
  });

  it("every entry in the list is already lowercase (matching relies on it)", () => {
    for (const domain of DISPOSABLE_EMAIL_DOMAINS) {
      expect(domain).toBe(domain.toLowerCase());
    }
  });
});
