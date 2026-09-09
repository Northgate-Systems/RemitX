import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

const { mockGetRate } = vi.hoisted(() => ({
  mockGetRate: vi.fn(),
}));

vi.mock("@/lib/rates", () => ({
  getRate: mockGetRate,
}));

import { GET, OPTIONS } from "../route";

function makeRequest(query: string) {
  return new Request(`http://localhost:3000/api/public/rate${query}`) as unknown as NextRequest;
}

beforeEach(() => {
  mockGetRate.mockReset();
});

describe("GET /api/public/rate - CORS", () => {
  it("sets an explicit open Access-Control-Allow-Origin on a successful lookup", async () => {
    mockGetRate.mockResolvedValue({
      rate: "1.10",
      fromAsset: "USD",
      toAsset: "EUR",
      fetchedAt: "2026-01-01T00:00:00.000Z",
      source: "cache",
    });

    const response = await GET(makeRequest("?from=USD&to=EUR"));

    expect(response.status).toBe(200);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(response.headers.get("Access-Control-Allow-Methods")).toContain("GET");
    expect(response.headers.get("Vary")).toBe("Origin");
  });

  it("still sets the CORS header on a validation error response, not just the happy path", async () => {
    const response = await GET(makeRequest("?from=USD"));

    expect(response.status).toBe(400);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });

  it("still sets the CORS header when the rate lookup throws", async () => {
    mockGetRate.mockRejectedValue(new Error("upstream down"));

    const response = await GET(makeRequest("?from=USD&to=EUR"));

    expect(response.status).toBe(500);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });

  it("OPTIONS returns a 204 preflight response with the CORS headers", async () => {
    const response = OPTIONS();

    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(response.headers.get("Access-Control-Allow-Methods")).toContain("OPTIONS");
  });
});
