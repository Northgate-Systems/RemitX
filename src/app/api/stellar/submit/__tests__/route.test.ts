import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Rate-limit coverage for POST /api/stellar/submit. The limiter buckets live
// in module scope inside @/lib/security, so every test re-imports the route
// through vi.resetModules() to start from a clean bucket.
// ---------------------------------------------------------------------------

const { mockGetCurrentUser, mockSubmitTransaction, mockFrom, mockMaybeSingle, mockSingle } =
  vi.hoisted(() => {
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
    };
  });

vi.mock("@/lib/auth", () => ({ getCurrentUser: mockGetCurrentUser }));
vi.mock("@/lib/supabase", () => ({ supabase: { from: mockFrom } }));
vi.mock("@/lib/stellar", () => ({ submitTransaction: mockSubmitTransaction }));

// @/lib/validations currently throws at import time on main
// (`ReferenceError: isValidStellarPublicKey is not defined`, introduced by
// #527, fix pending in #529), which would make this route un-importable in a
// test. Mock it with a copy of the real stellarSubmitSchema - identical
// definition, and unaffected by that bug. Once #529 lands this mock can go.
vi.mock("@/lib/validations", () => ({
  stellarSubmitSchema: z.object({
    signedXdr: z.string().min(1, "Signed XDR is required"),
    transactionId: z.string().min(1, "Transaction ID is required"),
  }),
}));

const USER = { id: "user-1", stellarPublicKey: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN" };
const SIGNED_XDR = "AAAAAgAAAABzaWduZWQ=";
const TX_ID = "11111111-1111-4111-8111-111111111111";

function postRequest() {
  return new NextRequest("http://localhost/api/stellar/submit", {
    method: "POST",
    body: JSON.stringify({ signedXdr: SIGNED_XDR, transactionId: TX_ID }),
    headers: { "content-type": "application/json" },
  });
}

/** Happy-path DB responses: the transaction exists, belongs to the user and
 *  is still pending, and the post-submit update succeeds. */
function stubHappyPathDb() {
  mockMaybeSingle.mockResolvedValue({
    data: { id: TX_ID, userId: USER.id, status: "pending" },
    error: null,
  });
  mockSingle.mockResolvedValue({
    data: {
      id: TX_ID,
      userId: USER.id,
      status: "confirmed",
      stellarTxHash: "hash",
      fromAsset: "XLM",
      toAsset: "XLM",
      fromAmount: "1",
      toAmount: "1",
    },
    error: null,
  });
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
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("POST /api/stellar/submit rate limiting", () => {
  it("allows the first 20 submissions in a window", async () => {
    mockGetCurrentUser.mockResolvedValue(USER);
    stubHappyPathDb();
    const { POST } = await importRoute();

    for (let i = 0; i < 20; i++) {
      const response = await POST(postRequest());
      expect(response.status, `request #${i + 1}`).toBe(200);
    }
  });

  it("returns 429 with the shared error shape once the limit is exceeded", async () => {
    mockGetCurrentUser.mockResolvedValue(USER);
    stubHappyPathDb();
    const { POST } = await importRoute();

    for (let i = 0; i < 20; i++) await POST(postRequest());
    const response = await POST(postRequest());
    const body = await response.json();

    expect(response.status).toBe(429);
    expect(body).toEqual({
      success: false,
      error: "Too many submit requests. Please try again later.",
    });
  });

  it("sends a Retry-After header in seconds on the 429", async () => {
    mockGetCurrentUser.mockResolvedValue(USER);
    stubHappyPathDb();
    const { POST } = await importRoute();

    for (let i = 0; i < 20; i++) await POST(postRequest());
    const response = await POST(postRequest());

    const retryAfter = Number(response.headers.get("Retry-After"));
    expect(Number.isNaN(retryAfter)).toBe(false);
    expect(retryAfter).toBeGreaterThan(0);
    expect(retryAfter).toBeLessThanOrEqual(60);
  });

  it("does not hit Horizon or the database once rate limited", async () => {
    mockGetCurrentUser.mockResolvedValue(USER);
    stubHappyPathDb();
    const { POST } = await importRoute();

    for (let i = 0; i < 20; i++) await POST(postRequest());
    mockFrom.mockClear();
    mockSubmitTransaction.mockClear();

    await POST(postRequest());

    expect(mockSubmitTransaction).not.toHaveBeenCalled();
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("buckets per user, so one noisy account cannot lock out another", async () => {
    mockGetCurrentUser.mockResolvedValue(USER);
    stubHappyPathDb();
    const { POST } = await importRoute();

    for (let i = 0; i < 21; i++) await POST(postRequest());
    expect((await POST(postRequest())).status).toBe(429);

    mockGetCurrentUser.mockResolvedValue({ ...USER, id: "user-2" });
    // The stored transaction has to belong to user-2 as well, otherwise the
    // ownership check (not the limiter) would be what answers.
    mockMaybeSingle.mockResolvedValue({
      data: { id: TX_ID, userId: "user-2", status: "pending" },
      error: null,
    });
    expect((await POST(postRequest())).status).toBe(200);
  });

  it("rate limits only authenticated callers - anonymous requests still get 401", async () => {
    mockGetCurrentUser.mockResolvedValue(null);
    const { POST } = await importRoute();

    const response = await POST(postRequest());
    expect(response.status).toBe(401);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("counts a request against the budget even when it fails validation", async () => {
    mockGetCurrentUser.mockResolvedValue(USER);
    const { POST } = await importRoute();

    const bad = () =>
      new NextRequest("http://localhost/api/stellar/submit", {
        method: "POST",
        body: JSON.stringify({}),
        headers: { "content-type": "application/json" },
      });

    for (let i = 0; i < 20; i++) {
      expect((await POST(bad())).status).toBe(400);
    }
    // Otherwise malformed bodies would be a free unlimited channel.
    expect((await POST(bad())).status).toBe(429);
  });
});
