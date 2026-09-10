import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockGetCurrentUser, mockGetLiquidityPool } = vi.hoisted(() => ({
  mockGetCurrentUser: vi.fn(),
  mockGetLiquidityPool: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  getCurrentUser: mockGetCurrentUser,
}));

vi.mock("@/lib/stellar", () => ({
  getLiquidityPool: mockGetLiquidityPool,
}));

import { GET } from "../route";

function makeRequest(query: string) {
  return new Request(`http://localhost/api/stellar/liquidity${query}`) as never;
}

function fakeUser() {
  return { id: "user-1", email: "user@example.com" };
}

beforeEach(() => {
  mockGetCurrentUser.mockReset();
  mockGetLiquidityPool.mockReset();
  mockGetCurrentUser.mockResolvedValue(fakeUser());
});

describe("GET /api/stellar/liquidity", () => {
  it("returns the pool with a private, short-TTL Cache-Control", async () => {
    mockGetLiquidityPool.mockResolvedValue({
      result: { pool: { id: "pool-1", reserves: [], totalShares: "1000" } },
      cached: false,
    });

    const response = await GET(makeRequest("?asset=XLM"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.pool.id).toBe("pool-1");
    expect(response.headers.get("Cache-Control")).toBe(
      "private, max-age=60, stale-while-revalidate=120"
    );
  });

  it("uses the same Cache-Control whether the lib layer served it from cache or not", async () => {
    mockGetLiquidityPool.mockResolvedValue({
      result: { pool: { id: "pool-1", reserves: [], totalShares: "1000" } },
      cached: true,
    });

    const response = await GET(makeRequest("?asset=XLM"));

    expect(response.headers.get("Cache-Control")).toBe(
      "private, max-age=60, stale-while-revalidate=120"
    );
  });

  it("still caches a { pool: null, reason } answer - that's a stable, real result", async () => {
    mockGetLiquidityPool.mockResolvedValue({
      result: { pool: null, reason: "No issuer configured for USDC" },
      cached: false,
    });

    const response = await GET(makeRequest("?asset=USDC"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.pool).toBeNull();
    expect(response.headers.get("Cache-Control")).toBe(
      "private, max-age=60, stale-while-revalidate=120"
    );
  });

  it("rejects an unauthenticated request with no-store, without calling getLiquidityPool", async () => {
    mockGetCurrentUser.mockResolvedValue(null);

    const response = await GET(makeRequest("?asset=XLM"));

    expect(response.status).toBe(401);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(mockGetLiquidityPool).not.toHaveBeenCalled();
  });

  it("rejects a missing 'asset' param with no-store, without calling getLiquidityPool", async () => {
    const response = await GET(makeRequest(""));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(mockGetLiquidityPool).not.toHaveBeenCalled();
  });

  it("marks an unexpected getLiquidityPool failure as no-store", async () => {
    mockGetLiquidityPool.mockRejectedValue(new Error("Horizon is down"));

    const response = await GET(makeRequest("?asset=XLM"));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.error).toBe("Horizon is down");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });
});
