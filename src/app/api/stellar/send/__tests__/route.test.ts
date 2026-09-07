import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Keypair } from "@stellar/stellar-sdk";

const { mockFrom } = vi.hoisted(() => ({ mockFrom: vi.fn() }));

vi.mock("@/lib/supabase", () => ({
  supabase: { from: mockFrom },
}));

vi.mock("@/lib/auth", () => ({
  getCurrentUser: vi.fn(),
}));

import { POST } from "../route";
import { getCurrentUser } from "@/lib/auth";
import { server } from "@/lib/stellar";
import type { NextRequest } from "next/server";

const SENDER = Keypair.random().publicKey();
const RECIPIENT = Keypair.random().publicKey();
/** Same shape, broken CRC16 checksum - i.e. a plausible copy/paste typo. */
const TYPO_RECIPIENT = RECIPIENT.slice(0, -1) + (RECIPIENT.slice(-1) === "A" ? "B" : "A");

function makeRequest(body: Record<string, unknown>) {
  return new Request("http://localhost/api/stellar/send", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

describe("POST /api/stellar/send - recipient validation", () => {
  beforeEach(() => {
    vi.mocked(getCurrentUser).mockResolvedValue({
      id: `550e8400-e29b-41d4-a716-4466554400${Math.floor(Math.random() * 90 + 10)}`,
      stellarPublicKey: SENDER,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects a checksum-invalid recipient with 400, without touching Horizon or the DB", async () => {
    const loadAccount = vi.spyOn(server, "loadAccount");

    const response = await POST(
      makeRequest({ fromAsset: "XLM", toAsset: "XLM", amount: "10", recipientAddress: TYPO_RECIPIENT })
    );
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.error).toMatch(/checksum/i);
    expect(loadAccount).not.toHaveBeenCalled();
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("rejects an over-precise amount with 400", async () => {
    const loadAccount = vi.spyOn(server, "loadAccount");

    const response = await POST(
      makeRequest({
        fromAsset: "XLM",
        toAsset: "XLM",
        amount: "1.12345678",
        recipientAddress: RECIPIENT,
      })
    );
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error).toMatch(/7 decimal places/);
    expect(loadAccount).not.toHaveBeenCalled();
  });

  it("still rejects a structurally wrong recipient with the shape message", async () => {
    const response = await POST(
      makeRequest({ fromAsset: "XLM", toAsset: "XLM", amount: "10", recipientAddress: "GNOPE" })
    );
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error).toBe("Invalid Stellar public key");
  });
});
