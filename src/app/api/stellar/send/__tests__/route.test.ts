import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

const { mockSingle, mockFrom } = vi.hoisted(() => ({
  mockSingle: vi.fn(),
  mockFrom: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: { from: mockFrom },
}));

vi.mock("@/lib/auth", () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock("@/lib/stellar", () => ({
  buildSendTransaction: vi.fn(),
  fetchRate: vi.fn(),
}));

vi.mock("@/lib/security", () => ({
  rateLimit: vi.fn(() => ({ allowed: true })),
  sanitizeInput: vi.fn((input: string) => input),
  detectPromptInjection: vi.fn(() => false),
  logSecurityEvent: vi.fn(),
  readBodyWithLimit: vi.fn(async (request: Request) => request.json()),
}));

import { POST } from "../route";
import { getCurrentUser } from "@/lib/auth";
import { buildSendTransaction, fetchRate } from "@/lib/stellar";

const OWNER_ID = "550e8400-e29b-41d4-a716-446655440000";
const VALID_RECIPIENT = "GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN7";

function makeChain() {
  const chain: Record<string, unknown> = {};
  chain.insert = vi.fn(() => chain);
  chain.select = vi.fn(() => chain);
  chain.single = mockSingle;
  return chain;
}

function fakeUser() {
  return {
    id: OWNER_ID,
    email: `${OWNER_ID}@example.com`,
    firstName: "Test",
    lastName: "User",
    stellarPublicKey: "GDUMMYACCOUNTPUBLICKEYFORUSERTESTINGPURPOSESONLYX",
    createdAt: new Date().toISOString(),
  };
}

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/stellar/send", {
    method: "POST",
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

const VALID_BODY = {
  fromAsset: "USDC",
  toAsset: "XLM",
  amount: "10",
  recipientAddress: VALID_RECIPIENT,
};

describe("POST /api/stellar/send", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSingle.mockReset();
    mockFrom.mockImplementation(() => makeChain());
    vi.mocked(fetchRate).mockResolvedValue("1.0");
  });

  it("returns 401 when not authenticated", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(401);
  });

  it("returns 400 when the user has no Stellar account yet", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ ...fakeUser(), stellarPublicKey: null });
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(400);
  });

  it("returns 400 (not 500) when the account doesn't have enough balance", async () => {
    // buildSendTransaction throws a plain Error("Insufficient balance: ...")
    // for this case - it's a problem with the request given the account's
    // current state, not a server fault, so it must land next to the
    // other "fix your input" 400s rather than a generic 500.
    vi.mocked(getCurrentUser).mockResolvedValue(fakeUser());
    vi.mocked(buildSendTransaction).mockRejectedValue(
      new Error("Insufficient balance: have 5 USDC, need 10 USDC")
    );

    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Insufficient balance");
  });

  it("still returns 400 for an invalid recipient address", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(fakeUser());
    vi.mocked(buildSendTransaction).mockRejectedValue(new Error("Invalid recipient address"));

    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(400);
  });

  it("returns 500 for an unrecognized failure (e.g. Horizon unreachable)", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(fakeUser());
    vi.mocked(buildSendTransaction).mockRejectedValue(new Error("Horizon request failed"));

    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(500);
  });

  it("returns 201 with the built transaction on success", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(fakeUser());
    vi.mocked(buildSendTransaction).mockResolvedValue("XDR_STRING");
    mockSingle.mockResolvedValue({ data: { id: "tx-1" }, error: null });

    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.transactionId).toBe("tx-1");
    expect(body.data.xdr).toBe("XDR_STRING");
  });
});
