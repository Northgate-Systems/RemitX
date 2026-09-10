import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SafeUser } from "@/lib/auth";

const { mockRange, mockOrder, mockLte, mockGte, mockEq, mockSelect, mockFrom } = vi.hoisted(() => ({
  mockRange: vi.fn(),
  mockOrder: vi.fn(),
  mockLte: vi.fn(),
  mockGte: vi.fn(),
  mockEq: vi.fn(),
  mockSelect: vi.fn(),
  mockFrom: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: { from: mockFrom },
}));

vi.mock("@/lib/auth", () => ({
  getCurrentUser: vi.fn(),
}));

import { GET } from "../route";
import { getCurrentUser } from "@/lib/auth";
import type { NextRequest } from "next/server";

const USER_ID = "550e8400-e29b-41d4-a716-446655440000";

function fakeUser(id = USER_ID): SafeUser {
  return {
    id,
    email: "u@example.com",
    firstName: "Test",
    lastName: "User",
    stellarPublicKey: null,
    kycStatus: "pending",
    sessionVersion: 1,
    failedLoginAttempts: 0,
    lockedUntil: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function fakeTx(overrides: Record<string, unknown> = {}) {
  return {
    id: "tx-1",
    userId: USER_ID,
    fromAsset: "USD",
    toAsset: "XLM",
    fromAmount: "100",
    toAmount: "50",
    recipientAddress: "GABC123",
    status: "confirmed",
    createdAt: "2026-09-01T00:00:00.000Z",
    ...overrides,
  };
}

// Chainable mock matching the real Supabase query builder: every filter
// method returns `this` so `.eq(...).gte(...).order(...).range(...)` all
// work regardless of which ones the route actually calls.
function makeChain(result: { data: unknown; error: unknown; count: number | null }) {
  const chain: Record<string, unknown> = {
    select: mockSelect,
    eq: mockEq,
    gte: mockGte,
    lte: mockLte,
    order: mockOrder,
    range: mockRange,
  };
  mockSelect.mockReturnValue(chain);
  mockEq.mockReturnValue(chain);
  mockGte.mockReturnValue(chain);
  mockLte.mockReturnValue(chain);
  mockOrder.mockReturnValue(chain);
  mockRange.mockResolvedValue(result);
  return chain;
}

// Route only reads request.url, so a plain Request is functionally
// equivalent to NextRequest here - cast to satisfy the GET() signature.
function makeRequest(query = ""): NextRequest {
  return new Request(`http://localhost/api/transactions${query}`) as unknown as NextRequest;
}

describe("GET /api/transactions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  it("returns 400 for an invalid status value", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(fakeUser());
    mockFrom.mockImplementation(() => makeChain({ data: [], error: null, count: 0 }));

    const res = await GET(makeRequest("?status=bogus"));
    expect(res.status).toBe(400);
  });

  it("returns 400 when from is after to", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(fakeUser());
    mockFrom.mockImplementation(() => makeChain({ data: [], error: null, count: 0 }));

    const res = await GET(makeRequest("?from=2026-09-10&to=2026-09-01"));
    expect(res.status).toBe(400);
  });

  it("returns 400 for a bad sortBy value", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(fakeUser());
    mockFrom.mockImplementation(() => makeChain({ data: [], error: null, count: 0 }));

    const res = await GET(makeRequest("?sortBy=fromAmount"));
    expect(res.status).toBe(400);
  });

  it("defaults to createdAt desc, limit 50, offset 0 with no query params", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(fakeUser());
    mockFrom.mockImplementation(() => makeChain({ data: [fakeTx()], error: null, count: 1 }));

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    expect(mockOrder).toHaveBeenCalledWith("createdAt", { ascending: false });
    expect(mockRange).toHaveBeenCalledWith(0, 49);
    const body = await res.json();
    expect(body.data.transactions).toHaveLength(1);
    expect(body.data.total).toBe(1);
  });

  it("applies the status filter", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(fakeUser());
    mockFrom.mockImplementation(() => makeChain({ data: [], error: null, count: 0 }));

    const res = await GET(makeRequest("?status=failed"));
    expect(res.status).toBe(200);
    expect(mockEq).toHaveBeenCalledWith("status", "failed");
  });

  it("applies from/to as a UTC range, extending a plain 'to' date to end-of-day", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(fakeUser());
    mockFrom.mockImplementation(() => makeChain({ data: [], error: null, count: 0 }));

    const res = await GET(makeRequest("?from=2026-09-01&to=2026-09-10"));
    expect(res.status).toBe(200);
    expect(mockGte).toHaveBeenCalledWith("createdAt", "2026-09-01T00:00:00.000Z");
    expect(mockLte).toHaveBeenCalledWith("createdAt", "2026-09-10T23:59:59.999Z");
  });

  it("applies a custom sortBy/sortOrder", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(fakeUser());
    mockFrom.mockImplementation(() => makeChain({ data: [], error: null, count: 0 }));

    const res = await GET(makeRequest("?sortBy=confirmedAt&sortOrder=asc"));
    expect(res.status).toBe(200);
    expect(mockOrder).toHaveBeenCalledWith("confirmedAt", { ascending: true });
  });

  it("clamps limit to 100 and rejects out-of-range values", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(fakeUser());
    mockFrom.mockImplementation(() => makeChain({ data: [], error: null, count: 0 }));

    const res = await GET(makeRequest("?limit=500"));
    expect(res.status).toBe(400);
  });

  it("scopes the query to the authenticated user", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(fakeUser());
    mockFrom.mockImplementation(() => makeChain({ data: [], error: null, count: 0 }));

    await GET(makeRequest());
    expect(mockEq).toHaveBeenCalledWith("userId", USER_ID);
  });

  it("returns unauthorizedResponse (401) on a Supabase error rather than leaking details", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(fakeUser());
    mockFrom.mockImplementation(() =>
      makeChain({ data: null, error: new Error("db down"), count: null })
    );

    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });
});
