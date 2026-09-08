import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { mockQueryRaw } = vi.hoisted(() => ({
  mockQueryRaw: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: { $queryRaw: mockQueryRaw },
}));

import { GET } from "../route";

beforeEach(() => {
  mockQueryRaw.mockReset();
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("GET /api/health", () => {
  it("returns 200 ok when both the database and Stellar Horizon are reachable", async () => {
    mockQueryRaw.mockResolvedValue([{ "?column?": 1 }]);
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 200 }));

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toEqual({ status: "ok", checks: { database: true, stellar: true } });
  });

  it("returns 503 degraded when the database query throws", async () => {
    mockQueryRaw.mockRejectedValue(new Error("connection refused"));
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 200 }));

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.data).toEqual({ status: "degraded", checks: { database: false, stellar: true } });
  });

  it("returns 503 degraded when Horizon responds with a non-2xx status", async () => {
    mockQueryRaw.mockResolvedValue([{ "?column?": 1 }]);
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 502 }));

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.data.checks).toEqual({ database: true, stellar: false });
  });

  it("returns 503 degraded when the Horizon fetch itself throws (network error/timeout)", async () => {
    mockQueryRaw.mockResolvedValue([{ "?column?": 1 }]);
    vi.mocked(fetch).mockRejectedValue(new Error("fetch failed"));

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.data.checks).toEqual({ database: true, stellar: false });
  });

  it("returns 503 degraded when both dependencies are down, not just the first one checked", async () => {
    mockQueryRaw.mockRejectedValue(new Error("connection refused"));
    vi.mocked(fetch).mockRejectedValue(new Error("fetch failed"));

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.data).toEqual({ status: "degraded", checks: { database: false, stellar: false } });
  });
});
