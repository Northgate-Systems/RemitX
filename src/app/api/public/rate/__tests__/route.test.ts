import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockGetRate } = vi.hoisted(() => ({
  mockGetRate: vi.fn(),
}));

vi.mock("@/lib/rates", () => ({
  getRate: mockGetRate,
}));

import { GET } from "../route";

function makeRequest(query: string) {
  return new Request(`http://localhost/api/public/rate${query}`);
}

function liveResult(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    rate: "0.921000",
    fromAsset: "USDC",
    toAsset: "EURC",
    fetchedAt: new Date().toISOString(),
    source: "api",
    ...overrides,
  };
}

beforeEach(() => {
  mockGetRate.mockReset();
});

describe("GET /api/public/rate", () => {
  it("returns the rate and lets a CDN/browser cache a live result for a minute", async () => {
    mockGetRate.mockResolvedValue(liveResult());

    const response = await GET(makeRequest("?from=USDC&to=EURC"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.rate).toBe("0.921000");
    expect(response.headers.get("Cache-Control")).toBe(
      "public, max-age=60, s-maxage=60, stale-while-revalidate=240"
    );
  });

  it("returns the same result for a cached rate lookup, still cacheable", async () => {
    mockGetRate.mockResolvedValue(liveResult({ source: "cache" }));

    const response = await GET(makeRequest("?from=USDC&to=EURC"));

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe(
      "public, max-age=60, s-maxage=60, stale-while-revalidate=240"
    );
  });

  it("marks a degraded (hardcoded-fallback) rate as no-store so a CDN doesn't keep serving it once live rates recover", async () => {
    mockGetRate.mockResolvedValue(liveResult({ rate: "1.00", source: "fallback" }));

    const response = await GET(makeRequest("?from=USDC&to=EURC"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.rate).toBe("1.00");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("rejects a missing 'to' param with no-store, without calling getRate", async () => {
    const response = await GET(makeRequest("?from=USDC"));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(mockGetRate).not.toHaveBeenCalled();
  });

  it("marks an unexpected getRate failure as no-store", async () => {
    mockGetRate.mockRejectedValue(new Error("boom"));

    const response = await GET(makeRequest("?from=USDC&to=EURC"));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.success).toBe(false);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });
});
