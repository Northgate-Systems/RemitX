import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

const { mockVerifyTurnstileToken } = vi.hoisted(() => ({
  mockVerifyTurnstileToken: vi.fn(),
}));

vi.mock("@/lib/turnstile", () => ({
  verifyTurnstileToken: mockVerifyTurnstileToken,
}));

import { POST } from "../route";

function makeRequest(body: Record<string, unknown>) {
  return new Request("http://localhost:3000/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

beforeEach(() => {
  mockVerifyTurnstileToken.mockReset();
});

describe("POST /api/auth/login - Turnstile failure handling", () => {
  it("returns a clear 400 (not a generic 500) when Turnstile verification fails", async () => {
    mockVerifyTurnstileToken.mockResolvedValue({
      success: false,
      reason: "invalid-input-response",
    });

    const response = await POST(
      makeRequest({
        email: "someone@example.com",
        password: "whatever-password",
        turnstileToken: "bad-token",
      })
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({
      success: false,
      error: "Verification failed: invalid-input-response",
    });
  });

  it("never reaches the database lookup when Turnstile fails - the route short-circuits before it", async () => {
    // No supabase mock is set up at all in this file. If the route tried to
    // query the (unconfigured) database after a failed Turnstile check, it
    // would throw and this test would fail loudly instead of silently
    // passing - which is exactly what we want to catch as a regression.
    mockVerifyTurnstileToken.mockResolvedValue({ success: false, reason: "timeout-or-duplicate" });

    const response = await POST(
      makeRequest({ email: "a@b.com", password: "x", turnstileToken: "bad" })
    );

    expect(response.status).toBe(400);
    expect(mockVerifyTurnstileToken).toHaveBeenCalledOnce();
  });
});
