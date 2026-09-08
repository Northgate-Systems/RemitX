import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

const { mockFrom, resultQueue } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  resultQueue: [] as Array<{ data: unknown; error: unknown }>,
}));

vi.mock("@/lib/supabase", () => ({
  supabase: { from: mockFrom },
}));

vi.mock("@/lib/auth", () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock("@/lib/stellar", () => ({
  submitTransaction: vi.fn(),
}));

import { POST } from "../route";
import { getCurrentUser } from "@/lib/auth";
import { submitTransaction } from "@/lib/stellar";

const OWNER_ID = "550e8400-e29b-41d4-a716-446655440000";
const TX_ID = "660e8400-e29b-41d4-a716-446655440000";

// Every supabase.from("transactions") call in this route eventually
// resolves through either maybeSingle(), single(), or a bare eq() -
// this one chain factory serves all three, popping the next queued
// result each time an awaited terminal method is called.
function makeChain() {
  const next = () => resultQueue.shift() ?? { data: null, error: null };
  const chain: Record<string, unknown> = {};
  chain.select = vi.fn(() => chain);
  chain.update = vi.fn(() => chain);
  chain.eq = vi.fn(() => chain);
  chain.maybeSingle = vi.fn(() => Promise.resolve(next()));
  chain.single = vi.fn(() => Promise.resolve(next()));
  // The "set status to validating" call is awaited directly on .eq()
  // without a .single()/.maybeSingle() afterwards, so .eq() itself must
  // also be thenable for that one call site.
  chain.then = (resolve: (v: { data: unknown; error: unknown }) => void) => resolve(next());
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

function fakeTx(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: TX_ID,
    userId: OWNER_ID,
    status: "pending",
    fromAsset: "USD",
    toAsset: "XLM",
    fromAmount: "100",
    toAmount: "50",
    ...overrides,
  };
}

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/stellar/submit", {
    method: "POST",
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

describe("POST /api/stellar/submit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resultQueue.length = 0;
    mockFrom.mockImplementation(() => makeChain());
  });

  it("returns 401 when not authenticated", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const res = await POST(makeRequest({ signedXdr: "AAAA", transactionId: TX_ID }));
    expect(res.status).toBe(401);
  });

  it("returns 400 for an invalid body", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(fakeUser());
    const res = await POST(makeRequest({ signedXdr: "", transactionId: "" }));
    expect(res.status).toBe(400);
  });

  it("returns 500 (not 404) when the transaction lookup query itself fails", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(fakeUser());
    resultQueue.push({ data: null, error: { message: "connection reset" } });

    const res = await POST(makeRequest({ signedXdr: "AAAA", transactionId: TX_ID }));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Failed to fetch transaction");
  });

  it("returns 404 when the transaction genuinely does not exist", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(fakeUser());
    resultQueue.push({ data: null, error: null });

    const res = await POST(makeRequest({ signedXdr: "AAAA", transactionId: TX_ID }));
    expect(res.status).toBe(404);
  });

  it("returns 401 when the transaction belongs to another user", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(fakeUser(OWNER_ID));
    resultQueue.push({ data: fakeTx({ userId: "someone-else" }), error: null });

    const res = await POST(makeRequest({ signedXdr: "AAAA", transactionId: TX_ID }));
    expect(res.status).toBe(401);
  });

  it("returns 400 when the transaction is not in pending status", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(fakeUser());
    resultQueue.push({ data: fakeTx({ status: "confirmed" }), error: null });

    const res = await POST(makeRequest({ signedXdr: "AAAA", transactionId: TX_ID }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Transaction is already in status: confirmed");
  });

  it("returns 200 with the confirmed transaction on a successful submit", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(fakeUser());
    vi.mocked(submitTransaction).mockResolvedValue({ hash: "abc123", status: "confirmed" });
    resultQueue.push({ data: fakeTx(), error: null }); // lookup
    resultQueue.push({ data: null, error: null }); // set-validating (unused)
    resultQueue.push({
      data: fakeTx({ status: "confirmed", stellarTxHash: "abc123" }),
      error: null,
    }); // final update

    const res = await POST(makeRequest({ signedXdr: "AAAA", transactionId: TX_ID }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.status).toBe("confirmed");
    expect(body.data.stellarTxHash).toBe("abc123");
  });
});
