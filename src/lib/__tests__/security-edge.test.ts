import { describe, it, expect } from "vitest";
import { NextResponse } from "next/server";
import { applySecurityHeaders, SECURITY_HEADERS, isAllowedOrigin, ALLOWED_ORIGINS } from "@/lib/security-edge";

// Issue #368: security-edge.ts must set these on *every* response, not just
// some routes. next.config.ts's `headers()` also reuses SECURITY_HEADERS so
// the middleware-excluded static paths (see config.matcher in
// src/middleware.ts) get identical values instead of a second, drifted copy.
const REQUIRED_HEADERS = [
  "Content-Security-Policy",
  "X-Frame-Options",
  "X-Content-Type-Options",
  "Referrer-Policy",
  "Strict-Transport-Security",
];

describe("SECURITY_HEADERS", () => {
  it("includes all 5 headers required by issue #368", () => {
    const keys = SECURITY_HEADERS.map((h) => h.key);
    for (const required of REQUIRED_HEADERS) {
      expect(keys).toContain(required);
    }
  });

  it("has no duplicate keys", () => {
    const keys = SECURITY_HEADERS.map((h) => h.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("sets a restrictive default-src in the CSP", () => {
    const csp = SECURITY_HEADERS.find((h) => h.key === "Content-Security-Policy");
    expect(csp?.value).toContain("default-src 'self'");
  });

  it("uses the strict, non-framable X-Frame-Options value", () => {
    const xfo = SECURITY_HEADERS.find((h) => h.key === "X-Frame-Options");
    expect(xfo?.value).toBe("DENY");
  });
});

describe("applySecurityHeaders", () => {
  it("sets every required header on the response", () => {
    const response = applySecurityHeaders(NextResponse.next());
    for (const required of REQUIRED_HEADERS) {
      expect(response.headers.get(required)).toBeTruthy();
    }
  });

  it("applies every entry from SECURITY_HEADERS, not a hand-picked subset", () => {
    const response = applySecurityHeaders(NextResponse.next());
    for (const { key, value } of SECURITY_HEADERS) {
      expect(response.headers.get(key)).toBe(value);
    }
  });

  it("returns the same response instance it was given", () => {
    const input = NextResponse.next();
    expect(applySecurityHeaders(input)).toBe(input);
  });
});

describe("isAllowedOrigin", () => {
  it("allows same-origin/non-CORS requests (null origin)", () => {
    expect(isAllowedOrigin(null)).toBe(true);
  });

  it("allows the production and Vercel preview domains", () => {
    expect(isAllowedOrigin("https://remitx.app")).toBe(true);
    expect(isAllowedOrigin("https://remitx.vercel.app")).toBe(true);
  });

  it("rejects an origin that isn't in the allowlist", () => {
    expect(isAllowedOrigin("https://evil.example.com")).toBe(false);
  });

  it("keeps ALLOWED_ORIGINS and isAllowedOrigin in sync", () => {
    for (const origin of ALLOWED_ORIGINS) {
      expect(isAllowedOrigin(origin)).toBe(true);
    }
  });
});
