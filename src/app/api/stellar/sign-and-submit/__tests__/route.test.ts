import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { Keypair } from "@stellar/stellar-sdk";

// ---------------------------------------------------------------------------
// Rate-limit coverage for POST /api/stellar/sign-and-submit. This endpoint
// takes a raw Stellar secret key and signs server-side, so it gets a tighter
// per-user budget (10/min) than /api/stellar/submit (20/min).
// ---------------------------------------------------------------------------

const {
  mockGetCurrentUser,
  mockSubmitTransaction,
  mockFrom,
  mockMaybeSingle,
  mockSingle,
  mockFromXDR,
} = vi.hoisted(() => {
  const mockMaybeSingle = vi.fn();
  const mockSingle = vi.fn();
  const chain: Record<string, unknown> = {};
  chain.select = vi.fn(() => chain);
  chain.eq = vi.fn(() => chain);
  chain.update = vi.fn(() => chain);
  chain.maybeSingle = mockMaybeSingle;
  chain.single = mockSingle;
  return {
    mockGetCurrentUser: vi.fn(),
    mockSubmitTransaction: vi.fn(),
    mockFrom: vi.fn(() => chain),
    mockMaybeSingle,
    mockSingle,
    mockFromXDR: vi.fn(),
  };
});

vi.mock("@/lib/auth", () => ({ getCurrentUser: mockGetCurrentUser }));
vi.mock("@/lib/supabase", () => ({ supabase: { from: mockFrom } }));
vi.mock("@/lib/stellar", () => ({
  submitTransaction: mockSubmitTransaction,
  NETWORK_PASSPHRASE: "Test SDF Network ; September 2015",
}));
vi.mock("@stellar/stellar-sdk", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@stellar/stellar-sdk")>();
  return {
    ...actual,
    TransactionBuilder: { ...actual.TransactionBuilder, fromXDR: mockFromXDR },
  };
});

const KEYPAIR = Keypair.random();
const USER = { id: "user-1", stellarPublicKey: KEYPAIR.publicKey() };
const TX_ID = "22222222-2222-4222-8222-222222222222";

function postRequest(overrides: Record<string, unknown> = {}) {
  return new NextRequest("http://localhost/api/stellar/sign-and-submit", {
    method: "POST",
    body: JSON.stringify({
      transactionId: TX_ID,
      xdr: "AAAAAgAAAAB1bnNpZ25lZA==",
      secretKey: KEYPAIR.secret(),
      ...overrides,
    }),
    headers: { "content-type": "application/json" },
  });
}

function stubHappyPathDb(userId = USER.id) {
  mockMaybeSingle.mockResolvedValue({
    data: { id: TX_ID, userId, status: "pending" },
    error: null,
  });
  mockSingle.mockResolvedValue({
    data: { id: TX_ID, userId, status: "confirmed", stellarTxHash: "hash" },
    error: null,
  });
  mockFromXDR.mockReturnValue({ sign: vi.fn(), toXDR: () => "signed-xdr" });
  mockSubmitTransaction.mockResolvedValue({ hash: "hash", status: "confirmed" });
}

async function importRoute() {
  vi.resetModules();
  return await import("../route");
}

beforeEach(() => {
  mockGetCurrentUser.mockReset();
  mockSubmitTransaction.mockReset();
  mockFrom.mockClear();
  mockMaybeSingle.mockReset();
  mockSingle.mockReset();
  mockFromXDR.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("POST /api/stellar/sign-and-submit rate limiting", () => {
  it("allows the first 10 signing requests in a window", async () => {
    mockGetCurrentUser.mockResolvedValue(USER);
    stubHappyPathDb();
    const { POST } = await importRoute();

    for (let i = 0; i < 10; i++) {
      expect((await POST(postRequest())).status, `request #${i + 1}`).toBe(200);
    }
  });

  it("returns 429 with Retry-After on the 11th request", async () => {
    mockGetCurrentUser.mockResolvedValue(USER);
    stubHappyPathDb();
    const { POST } = await importRoute();

    for (let i = 0; i < 10; i++) await POST(postRequest());
    const response = await POST(postRequest());
    const body = await response.json();

    expect(response.status).toBe(429);
    expect(body).toEqual({
      success: false,
      error: "Too many signing requests. Please try again later.",
    });
    const retryAfter = Number(response.headers.get("Retry-After"));
    expect(retryAfter).toBeGreaterThan(0);
    expect(retryAfter).toBeLessThanOrEqual(60);
  });

  it("is stricter than /api/stellar/submit because it handles secret keys", async () => {
    mockGetCurrentUser.mockResolvedValue(USER);
    stubHappyPathDb();
    const { POST } = await importRoute();

    for (let i = 0; i < 10; i++) await POST(postRequest());
    // 20 would still be allowed on /api/stellar/submit; here it must not be.
    expect((await POST(postRequest())).status).toBe(429);
  });

  it("never reaches the signing/submit path once rate limited", async () => {
    mockGetCurrentUser.mockResolvedValue(USER);
    stubHappyPathDb();
    const { POST } = await importRoute();

    for (let i = 0; i < 10; i++) await POST(postRequest());
    mockFromXDR.mockClear();
    mockSubmitTransaction.mockClear();
    mockFrom.mockClear();

    await POST(postRequest());

    expect(mockFromXDR).not.toHaveBeenCalled();
    expect(mockSubmitTransaction).not.toHaveBeenCalled();
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("burns budget on rejected secret keys too, so key-guessing is throttled", async () => {
    mockGetCurrentUser.mockResolvedValue(USER);
    stubHappyPathDb();
    const { POST } = await importRoute();

    for (let i = 0; i < 10; i++) {
      const response = await POST(postRequest({ secretKey: "SNOTAREALSECRETKEY" }));
      expect(response.status).toBe(400);
    }
    expect((await POST(postRequest())).status).toBe(429);
  });

  it("keeps separate budgets per user", async () => {
    mockGetCurrentUser.mockResolvedValue(USER);
    stubHappyPathDb();
    const { POST } = await importRoute();

    for (let i = 0; i < 11; i++) await POST(postRequest());
    expect((await POST(postRequest())).status).toBe(429);

    mockGetCurrentUser.mockResolvedValue({ ...USER, id: "user-2" });
    stubHappyPathDb("user-2");
    expect((await POST(postRequest())).status).toBe(200);
  });

  it("still answers 401 for an anonymous caller", async () => {
    mockGetCurrentUser.mockResolvedValue(null);
    const { POST } = await importRoute();

    expect((await POST(postRequest())).status).toBe(401);
    expect(mockFrom).not.toHaveBeenCalled();
  });
});
