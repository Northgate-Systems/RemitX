import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth", () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock("@/lib/stellar", () => ({
  getFeeEstimate: vi.fn(),
}));

import { GET } from "../route";
import { getCurrentUser } from "@/lib/auth";
import { getFeeEstimate } from "@/lib/stellar";

function fakeUser() {
  return {
    id: "550e8400-e29b-41d4-a716-446655440000",
    email: "test@example.com",
    firstName: "Test",
    lastName: "User",
    createdAt: new Date().toISOString(),
  };
}

const FAKE_ESTIMATE = {
  baseFeeStroops: 100,
  recommendedFeeStroops: 100,
  isSurgePricing: false,
  ledgerCapacityUsagePct: 12,
  percentiles: {
    p10: 100, p20: 100, p30: 100, p40: 100, p50: 100,
    p60: 100, p70: 100, p80: 100, p90: 100, p95: 100, p99: 100,
  },
};

describe("GET /api/stellar/fee-estimate", () => {
  beforeEach(() => {
    vi.mocked(getCurrentUser).mockReset();
    vi.mocked(getFeeEstimate).mockReset();
  });

  it("returns 401 for an unauthenticated request without calling Horizon", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);

    const res = await GET();

    expect(res.status).toBe(401);
    expect(getFeeEstimate).not.toHaveBeenCalled();
  });

  it("returns the fee estimate for a logged-in user", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(getCurrentUser).mockResolvedValue(fakeUser() as any);
    vi.mocked(getFeeEstimate).mockResolvedValue(FAKE_ESTIMATE);

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ success: true, data: FAKE_ESTIMATE });
  });

  it("returns a 500 with a generic message when Horizon is unreachable, without leaking the raw error", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(getCurrentUser).mockResolvedValue(fakeUser() as any);
    vi.mocked(getFeeEstimate).mockRejectedValue(new Error("Horizon unreachable"));

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.error).toBe("Failed to fetch fee estimate");
  });
});
