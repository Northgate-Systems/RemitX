import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

const { mockMaybeSingle, mockFrom } = vi.hoisted(() => ({
  mockMaybeSingle: vi.fn(),
  mockFrom: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: { from: mockFrom },
}));

vi.mock("@/lib/auth", () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock("@/lib/stellar", () => ({
  submitTransaction: vi.fn(),
  NETWORK_PASSPHRASE: "Test SDF Network ; September 2015",
}));

import { POST } from "../route";
import { getCurrentUser } from "@/lib/auth";

const OWNER_ID = "550e8400-e29b-41d4-a716-446655440000";
const TX_ID = "660e8400-e29b-41d4-a716-446655440000";

function makeChain() {
  const chain: Record<string, unknown> = {};
  chain.select = vi.fn(() => chain);
  chain.eq = vi.fn(() => chain);
  chain.maybeSingle = mockMaybeSingle;
  return chain;
}

function fakeUser() {
  return {
    id: OWNER_ID,
    email: `${OWNER_ID}@example.com`,
    firstName: "Test",
    lastName: "User",
    createdAt: new Date().toISOString(),
  };
}

function fakeTx(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: TX_ID,
    userId: OWNER_ID,
    status: "pending",
    ...overrides,
  };
}

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/stellar/sign-and-submit", {
    method: "POST",
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

const VALID_BODY = { transactionId: TX_ID, xdr: "AAAA", secretKey: "SFAKEKEY" };

// These tests cover only the transaction-lookup branch this fix touches
// (a failed query vs. a genuinely missing row); the signing/submit path
// below it needs a real Keypair + XDR and its status codes weren't
// changed here.
describe("POST /api/stellar/sign-and-submit (lookup status codes)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMaybeSingle.mockReset();
    mockFrom.mockImplementation(() => makeChain());
  });

  it("returns 401 when not authenticated", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(401);
  });

  it("returns 400 when a required field is missing", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(fakeUser());
    const res = await POST(makeRequest({ transactionId: TX_ID }));
    expect(res.status).toBe(400);
  });

  it("returns 500 (not 404) when the lookup query itself fails", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(fakeUser());
    mockMaybeSingle.mockResolvedValue({ data: null, error: { message: "connection reset" } });

    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Failed to fetch transaction");
  });

  it("returns 404 when the transaction genuinely does not exist", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(fakeUser());
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });

    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(404);
  });

  it("returns 401 when the transaction belongs to another user", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(fakeUser());
    mockMaybeSingle.mockResolvedValue({ data: fakeTx({ userId: "someone-else" }), error: null });

    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(401);
  });

  it("returns 400 when the transaction is not pending", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(fakeUser());
    mockMaybeSingle.mockResolvedValue({ data: fakeTx({ status: "confirmed" }), error: null });

    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(400);
  });

  it("returns 400 for a malformed secret key, past the lookup", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(fakeUser());
    mockMaybeSingle.mockResolvedValue({ data: fakeTx(), error: null });

    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("That doesn't look like a valid Stellar secret key.");
  });
});
