import { describe, it, expect, beforeEach } from "vitest";
import {
  getClientIp,
  enforceRateLimit,
  rateLimit,
  resetRateLimits,
  RATE_LIMIT_POLICIES,
  MAX_RATE_BUCKETS,
} from "@/lib/security";

function req(headers: Record<string, string> = {}): { headers: Headers } {
  return { headers: new Headers(headers) };
}

beforeEach(() => {
  resetRateLimits();
});

describe("getClientIp", () => {
  it("prefers x-real-ip, which a proxy sets and a client cannot append to", () => {
    expect(
      getClientIp(
        req({ "x-real-ip": "203.0.113.7", "x-forwarded-for": "1.2.3.4" })
      )
    ).toBe("203.0.113.7");
  });

  it("ignores a client-seeded leftmost X-Forwarded-For entry", () => {
    // Client sends "9.9.9.9"; the proxy appends the address it actually saw.
    expect(getClientIp(req({ "x-forwarded-for": "9.9.9.9, 203.0.113.7" }))).toBe(
      "203.0.113.7"
    );
  });

  it("returns the single entry when only the proxy wrote the header", () => {
    expect(getClientIp(req({ "x-forwarded-for": "203.0.113.7" }))).toBe(
      "203.0.113.7"
    );
  });

  it("tolerates padding and empty entries", () => {
    expect(getClientIp(req({ "x-forwarded-for": " 9.9.9.9 , , 203.0.113.7 " }))).toBe(
      "203.0.113.7"
    );
  });

  it("returns null when neither header is present", () => {
    expect(getClientIp(req())).toBeNull();
    expect(getClientIp(req({ "x-forwarded-for": "" }))).toBeNull();
  });
});

describe("enforceRateLimit", () => {
  it("allows exactly the policy limit, then blocks (happy path + failure path)", () => {
    const { limit } = RATE_LIMIT_POLICIES.login;
    const headers = { "x-real-ip": "198.51.100.1" };

    for (let i = 0; i < limit; i += 1) {
      expect(enforceRateLimit(req(headers), "login")).toBeNull();
    }
    expect(enforceRateLimit(req(headers), "login")).not.toBeNull();
  });

  it("returns the api-response error shape with a Retry-After header", async () => {
    const { limit, message } = RATE_LIMIT_POLICIES["forgot-password"];
    const headers = { "x-real-ip": "198.51.100.2" };

    for (let i = 0; i < limit; i += 1) {
      enforceRateLimit(req(headers), "forgot-password");
    }
    const blocked = enforceRateLimit(req(headers), "forgot-password");

    expect(blocked).not.toBeNull();
    expect(blocked!.status).toBe(429);
    expect(await blocked!.json()).toEqual({ success: false, error: message });

    const retryAfter = Number(blocked!.headers.get("Retry-After"));
    expect(retryAfter).toBeGreaterThanOrEqual(1);
    expect(retryAfter).toBeLessThanOrEqual(60);
  });

  it("does NOT hand out a fresh bucket when the caller rotates X-Forwarded-For", () => {
    // Regression: reading the leftmost entry let one caller mint a new bucket
    // per request and bypass the limit entirely.
    const { limit } = RATE_LIMIT_POLICIES.login;
    let blocked = false;

    for (let i = 0; i < limit + 5; i += 1) {
      const spoofed = req({ "x-forwarded-for": `10.0.0.${i}, 198.51.100.3` });
      if (enforceRateLimit(spoofed, "login")) blocked = true;
    }
    expect(blocked).toBe(true);
  });

  it("keeps different callers in separate buckets", () => {
    const { limit } = RATE_LIMIT_POLICIES.login;
    for (let i = 0; i < limit; i += 1) {
      enforceRateLimit(req({ "x-real-ip": "198.51.100.4" }), "login");
    }
    expect(enforceRateLimit(req({ "x-real-ip": "198.51.100.4" }), "login")).not.toBeNull();
    expect(enforceRateLimit(req({ "x-real-ip": "198.51.100.5" }), "login")).toBeNull();
  });

  it("keeps policies independent of each other for the same caller", () => {
    const headers = { "x-real-ip": "198.51.100.6" };
    for (let i = 0; i < RATE_LIMIT_POLICIES["forgot-password"].limit; i += 1) {
      enforceRateLimit(req(headers), "forgot-password");
    }
    expect(enforceRateLimit(req(headers), "forgot-password")).not.toBeNull();
    expect(enforceRateLimit(req(headers), "login")).toBeNull();
  });

  it("keys user-scoped policies by user id, not by address", () => {
    const { limit } = RATE_LIMIT_POLICIES["stellar-send"];
    const shared = req({ "x-real-ip": "198.51.100.7" });

    for (let i = 0; i < limit; i += 1) {
      expect(enforceRateLimit(shared, "stellar-send", "user-a")).toBeNull();
    }
    expect(enforceRateLimit(shared, "stellar-send", "user-a")).not.toBeNull();
    // Same address, different user: unaffected.
    expect(enforceRateLimit(shared, "stellar-send", "user-b")).toBeNull();
  });

  it("throws if a user-scoped policy is used without a subject", () => {
    expect(() => enforceRateLimit(req(), "stellar-send")).toThrow(/user-scoped/);
  });

  it("still limits callers whose address cannot be resolved", () => {
    const { limit } = RATE_LIMIT_POLICIES.login;
    for (let i = 0; i < limit; i += 1) {
      expect(enforceRateLimit(req(), "login")).toBeNull();
    }
    expect(enforceRateLimit(req(), "login")).not.toBeNull();
  });
});

describe("rate-limit bucket store", () => {
  it("stays bounded when flooded with distinct keys", () => {
    for (let i = 0; i < MAX_RATE_BUCKETS + 500; i += 1) {
      rateLimit(`flood:${i}`, 5, 60_000);
    }
    // Buckets are not directly observable; the cap is enforced by evicting the
    // entries closest to expiry, so the earliest keys must have been dropped
    // and therefore start a fresh window.
    expect(rateLimit("flood:0", 1, 60_000).allowed).toBe(true);
  });

  it("declares a usable policy for every route name", () => {
    for (const [name, policy] of Object.entries(RATE_LIMIT_POLICIES)) {
      expect(policy.limit, name).toBeGreaterThan(0);
      expect(policy.windowMs, name).toBeGreaterThan(0);
      expect(policy.message.length, name).toBeGreaterThan(0);
      expect(["ip", "user"], name).toContain(policy.scope);
    }
  });
});
