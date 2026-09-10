import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockGetCurrentUser, mockGetRate } = vi.hoisted(() => ({
  mockGetCurrentUser: vi.fn(),
  mockGetRate: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  getCurrentUser: mockGetCurrentUser,
}));

vi.mock("@/lib/rates", () => ({
  getRate: mockGetRate,
}));

import { GET } from "../route";

function makeRequest(query: string) {
  return new Request(`http://localhost/api/stellar/rate${query}`);
}

function fakeUser() {
  return { id: "user-1", email: "user@example.com" };
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
  mockGetCurrentUser.mockReset();
  mockGetRate.mockReset();
  mockGetCurrentUser.mockResolvedValue(fakeUser());
});

describe("GET /api/stellar/rate", () => {
  it("returns the rate with a private, short-TTL Cache-Control for a live result", async () => {
    mockGetRate.mockResolvedValue(liveResult());

    const response = await GET(makeRequest("?from=USDC&to=EURC") as never);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.rate).toBe("0.921000");
    expect(response.headers.get("Cache-Control")).toBe(
      "private, max-age=30, stale-while-revalidate=60"
    );
  });

  it("uses the same private Cache-Control for a cached rate lookup", async () => {
    mockGetRate.mockResolvedValue(liveResult({ source: "cache" }));

    const response = await GET(makeRequest("?from=USDC&to=EURC") as never);

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe(
      "private, max-age=30, stale-while-revalidate=60"
    );
  });

  it("uses `private`, not `public`, unlike the unauthenticated /api/public/rate", async () => {
    mockGetRate.mockResolvedValue(liveResult());

    const response = await GET(makeRequest("?from=USDC&to=EURC") as never);

    expect(response.headers.get("Cache-Control")).not.toContain("public");
  });

  it("marks a degraded (hardcoded-fallback) rate as no-store", async () => {
    mockGetRate.mockResolvedValue(liveResult({ rate: "1.00", source: "fallback" }));

    const response = await GET(makeRequest("?from=USDC&to=EURC") as never);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.rate).toBe("1.00");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("rejects an unauthenticated request with no-store, without calling getRate", async () => {
    mockGetCurrentUser.mockResolvedValue(null);

    const response = await GET(makeRequest("?from=USDC&to=EURC") as never);

    expect(response.status).toBe(401);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(mockGetRate).not.toHaveBeenCalled();
  });

  it("rejects a missing 'to' param with no-store, without calling getRate", async () => {
    const response = await GET(makeRequest("?from=USDC") as never);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(mockGetRate).not.toHaveBeenCalled();
  });

  it("marks an unexpected getRate failure as no-store", async () => {
    mockGetRate.mockRejectedValue(new Error("boom"));

    const response = await GET(makeRequest("?from=USDC&to=EURC") as never);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.success).toBe(false);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });
});
