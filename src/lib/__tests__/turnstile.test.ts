import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { verifyTurnstileToken } from "../turnstile";

const ORIGINAL_SECRET = process.env.TURNSTILE_SECRET_KEY;

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
  if (ORIGINAL_SECRET === undefined) {
    delete process.env.TURNSTILE_SECRET_KEY;
  } else {
    process.env.TURNSTILE_SECRET_KEY = ORIGINAL_SECRET;
  }
});

describe("verifyTurnstileToken", () => {
  it("skips verification (success: true) when TURNSTILE_SECRET_KEY is not configured", async () => {
    delete process.env.TURNSTILE_SECRET_KEY;

    const result = await verifyTurnstileToken("any-token");

    expect(result).toEqual({ success: true });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("fails with a clear reason when the token is missing, once a secret is configured", async () => {
    process.env.TURNSTILE_SECRET_KEY = "test-secret";

    const resultUndefined = await verifyTurnstileToken(undefined);
    const resultNull = await verifyTurnstileToken(null);
    const resultEmpty = await verifyTurnstileToken("");

    for (const result of [resultUndefined, resultNull, resultEmpty]) {
      expect(result.success).toBe(false);
      expect(result.reason).toBe("Missing verification token");
    }
    expect(fetch).not.toHaveBeenCalled();
  });

  it("succeeds when Cloudflare confirms the token", async () => {
    process.env.TURNSTILE_SECRET_KEY = "test-secret";
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ success: true }), { status: 200 })
    );

    const result = await verifyTurnstileToken("valid-token");

    expect(result).toEqual({ success: true });
  });

  it("fails with the joined error-codes when Cloudflare rejects the token", async () => {
    process.env.TURNSTILE_SECRET_KEY = "test-secret";
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({ success: false, "error-codes": ["invalid-input-response", "timeout-or-duplicate"] }),
        { status: 200 }
      )
    );

    const result = await verifyTurnstileToken("bad-token");

    expect(result.success).toBe(false);
    expect(result.reason).toBe("invalid-input-response, timeout-or-duplicate");
  });

  it("falls back to a generic reason when Cloudflare rejects without error-codes", async () => {
    process.env.TURNSTILE_SECRET_KEY = "test-secret";
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ success: false }), { status: 200 })
    );

    const result = await verifyTurnstileToken("bad-token");

    expect(result).toEqual({ success: false, reason: "Verification failed" });
  });

  it("returns a clear, non-throwing reason when the verification request itself fails (network error/timeout)", async () => {
    process.env.TURNSTILE_SECRET_KEY = "test-secret";
    vi.mocked(fetch).mockRejectedValue(new Error("fetch failed"));

    const result = await verifyTurnstileToken("some-token");

    expect(result).toEqual({ success: false, reason: "Couldn't reach the verification service" });
  });

  it("returns a clear, non-throwing reason when Cloudflare's response body isn't valid JSON", async () => {
    process.env.TURNSTILE_SECRET_KEY = "test-secret";
    vi.mocked(fetch).mockResolvedValue(new Response("<html>502 Bad Gateway</html>", { status: 502 }));

    const result = await verifyTurnstileToken("some-token");

    expect(result).toEqual({ success: false, reason: "Couldn't reach the verification service" });
  });
});
