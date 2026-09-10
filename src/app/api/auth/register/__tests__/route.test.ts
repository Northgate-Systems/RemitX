import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockFrom, mockHashPassword, mockSignToken, mockSetSessionCookie, mockToSafeUser, mockVerifyTurnstileToken, mockCreateTestnetAccount } =
  vi.hoisted(() => ({
    mockFrom: vi.fn(),
    mockHashPassword: vi.fn(),
    mockSignToken: vi.fn(),
    mockSetSessionCookie: vi.fn(),
    mockToSafeUser: vi.fn(),
    mockVerifyTurnstileToken: vi.fn(),
    mockCreateTestnetAccount: vi.fn(),
  }));

vi.mock("@/lib/supabase", () => ({
  supabase: { from: mockFrom },
}));

vi.mock("@/lib/auth", () => ({
  hashPassword: mockHashPassword,
  signToken: mockSignToken,
  setSessionCookie: mockSetSessionCookie,
  toSafeUser: mockToSafeUser,
}));

vi.mock("@/lib/turnstile", () => ({
  verifyTurnstileToken: mockVerifyTurnstileToken,
}));

vi.mock("@/lib/stellar", () => ({
  createTestnetAccount: mockCreateTestnetAccount,
}));

import { POST } from "../route";

const VALID_BODY = {
  firstName: "Peter",
  lastName: "Okoye",
  email: "peter@example.com",
  password: "Str0ngPass!",
  confirmPassword: "Str0ngPass!",
  turnstileToken: "test-token",
};

// Each call gets its own IP so the real (unmocked) in-memory rate limiter
// in src/lib/security.ts doesn't carry a bucket over between tests.
let ipCounter = 0;
function makeRequest(body: Record<string, unknown>) {
  ipCounter += 1;
  return new Request("http://localhost/api/auth/register", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": `10.0.0.${ipCounter}`,
    },
    body: JSON.stringify(body),
  });
}

/** Chainable mock matching `.from().select().eq().maybeSingle()` (existence
 * check) and `.from().insert().select().single()` (the actual insert). */
function makeSupabaseChain(existingUser: unknown, insertedUser: unknown, insertError: unknown = null) {
  const chain: Record<string, unknown> = {};
  chain.select = vi.fn().mockReturnValue(chain);
  chain.eq = vi.fn().mockReturnValue(chain);
  chain.maybeSingle = vi.fn().mockResolvedValue({ data: existingUser, error: null });
  chain.insert = vi.fn().mockReturnValue(chain);
  chain.single = vi.fn().mockResolvedValue({ data: insertedUser, error: insertError });
  return chain;
}

const INSERTED_USER = {
  id: "550e8400-e29b-41d4-a716-446655440000",
  firstName: "Peter",
  lastName: "Okoye",
  email: "peter@example.com",
  passwordHash: "hashed",
  stellarPublicKey: "GABC123",
};

beforeEach(() => {
  vi.clearAllMocks();
  mockHashPassword.mockResolvedValue("hashed");
  mockSignToken.mockReturnValue("jwt-token");
  mockSetSessionCookie.mockResolvedValue(undefined);
  mockToSafeUser.mockImplementation((u: Record<string, unknown>) => {
    const { passwordHash: _passwordHash, ...safe } = u;
    return safe;
  });
  mockVerifyTurnstileToken.mockResolvedValue({ success: true });
  mockCreateTestnetAccount.mockResolvedValue({
    publicKey: "GABC123",
    secretKey: "SABC123SECRET",
  });
  mockFrom.mockReturnValue(makeSupabaseChain(null, INSERTED_USER));
});

describe("POST /api/auth/register", () => {
  it("returns the Stellar secret key exactly once in the response", async () => {
    const res = await POST(makeRequest(VALID_BODY) as never);
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.success).toBe(true);
    expect(body.data.stellarSecretKey).toBe("SABC123SECRET");
  });

  it("never logs the secret key to the console", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      await POST(makeRequest(VALID_BODY) as never);
      const loggedAnywhere = logSpy.mock.calls.some((call) =>
        call.some((arg) => typeof arg === "string" && arg.includes("SABC123SECRET"))
      );
      expect(loggedAnywhere).toBe(false);
    } finally {
      logSpy.mockRestore();
    }
  });

  it("does not include the password hash in the response", async () => {
    const res = await POST(makeRequest(VALID_BODY) as never);
    const body = await res.json();

    expect(body.data.user.passwordHash).toBeUndefined();
  });

  it("returns stellarSecretKey: null when Stellar account creation fails", async () => {
    mockCreateTestnetAccount.mockRejectedValue(new Error("friendbot down"));
    mockFrom.mockReturnValue(
      makeSupabaseChain(null, { ...INSERTED_USER, stellarPublicKey: null })
    );

    const res = await POST(makeRequest(VALID_BODY) as never);
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.data.stellarSecretKey).toBeNull();
  });

  it("rejects registration when the email is already taken", async () => {
    mockFrom.mockReturnValue(makeSupabaseChain({ id: "existing-id" }, INSERTED_USER));

    const res = await POST(makeRequest(VALID_BODY) as never);
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.success).toBe(false);
    expect(mockCreateTestnetAccount).not.toHaveBeenCalled();
  });

  it("rejects an invalid body before touching Stellar or the database", async () => {
    const res = await POST(makeRequest({ ...VALID_BODY, email: "not-an-email" }) as never);

    expect(res.status).toBe(400);
    expect(mockCreateTestnetAccount).not.toHaveBeenCalled();
    expect(mockFrom).not.toHaveBeenCalled();
  });
});
