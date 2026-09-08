import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

const { mockRange, mockFrom } = vi.hoisted(() => ({
  mockRange: vi.fn(),
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

const OWNER_ID = "550e8400-e29b-41d4-a716-446655440000";

function makeChain() {
  const selectMock = vi.fn();
  const eqMock = vi.fn();
  const orderMock = vi.fn();
  const chain: Record<string, unknown> = {
    select: selectMock,
    eq: eqMock,
    order: orderMock,
    range: mockRange,
  };
  selectMock.mockReturnValue(chain);
  eqMock.mockReturnValue(chain);
  orderMock.mockReturnValue(chain);
  return chain;
}

function fakeUser(id = OWNER_ID) {
  return {
    id,
    email: `${id}@example.com`,
    firstName: "Test",
    lastName: "User",
    createdAt: new Date().toISOString(),
  };
}

function makeRequest(query = "") {
  return new Request(`http://localhost/api/transactions${query}`) as unknown as NextRequest;
}

describe("GET /api/transactions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRange.mockReset();
    mockFrom.mockImplementation(() => makeChain());
  });

  it("returns 401 when not authenticated, without querying the database", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("returns 500 (not 401) when the underlying query fails", async () => {
    // This used to return unauthorizedResponse() here, which told the
    // client "you're logged out" for what was actually a database error -
    // a plain query failure must surface as a server error instead.
    vi.mocked(getCurrentUser).mockResolvedValue(fakeUser());
    mockRange.mockResolvedValue({ data: null, error: { message: "connection reset" }, count: null });

    const res = await GET(makeRequest());
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Failed to fetch transactions");
  });

  it("returns 500 (not 401) when an unexpected exception is thrown", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(fakeUser());
    mockRange.mockRejectedValue(new Error("boom"));

    const res = await GET(makeRequest());
    expect(res.status).toBe(500);
  });

  it("returns 200 with the user's transactions, total, limit, and offset", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(fakeUser());
    const rows = [{ id: "tx-1" }, { id: "tx-2" }];
    mockRange.mockResolvedValue({ data: rows, error: null, count: 2 });

    const res = await GET(makeRequest("?limit=10&offset=5"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.transactions).toEqual(rows);
    expect(body.data.total).toBe(2);
    expect(body.data.limit).toBe(10);
    expect(body.data.offset).toBe(5);
  });

  it("caps limit at 100 even if a larger value is requested", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(fakeUser());
    mockRange.mockResolvedValue({ data: [], error: null, count: 0 });

    const res = await GET(makeRequest("?limit=9999"));
    const body = await res.json();
    expect(body.data.limit).toBe(100);
  });
});
