import { describe, it, expect, vi, afterEach } from "vitest";
import { server, getFeeEstimate } from "@/lib/stellar";

function fakeFeeStats(overrides: { fee_charged?: Partial<Record<string, string>>; ledger_capacity_usage?: string } = {}) {
  const flat = (v: string) => ({
    max: v, min: v, mode: v,
    p10: v, p20: v, p30: v, p40: v, p50: v, p60: v, p70: v, p80: v, p90: v, p95: v, p99: v,
  });
  return {
    last_ledger: "123456",
    last_ledger_base_fee: "100",
    ledger_capacity_usage: overrides.ledger_capacity_usage ?? "0.1",
    fee_charged: { ...flat("100"), ...overrides.fee_charged },
    max_fee: flat("100"),
  } as Awaited<ReturnType<typeof server.feeStats>>;
}

describe("getFeeEstimate", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("reports no surge pricing when the median charged fee equals the base fee", async () => {
    vi.spyOn(server, "feeStats").mockResolvedValue(fakeFeeStats());

    const result = await getFeeEstimate();

    expect(result.baseFeeStroops).toBe(100);
    expect(result.isSurgePricing).toBe(false);
    expect(result.recommendedFeeStroops).toBe(100);
  });

  it("detects surge pricing when the median charged fee rises above base", async () => {
    vi.spyOn(server, "feeStats").mockResolvedValue(
      fakeFeeStats({ fee_charged: { p50: "5000", p90: "20000", p99: "50000" } })
    );

    const result = await getFeeEstimate();

    expect(result.isSurgePricing).toBe(true);
    expect(result.recommendedFeeStroops).toBe(5000);
    expect(result.percentiles.p90).toBe(20000);
    expect(result.percentiles.p99).toBe(50000);
  });

  it("never recommends less than the network base fee, even if p50 somehow reports lower", async () => {
    // Shouldn't happen in practice, but the recommendation is a floor at
    // the base fee regardless of what the percentile says.
    vi.spyOn(server, "feeStats").mockResolvedValue(
      fakeFeeStats({ fee_charged: { p50: "0" } })
    );

    const result = await getFeeEstimate();

    expect(result.recommendedFeeStroops).toBe(100);
  });

  it("converts ledger_capacity_usage from a 0-1 fraction to a 0-100 percentage", async () => {
    vi.spyOn(server, "feeStats").mockResolvedValue(
      fakeFeeStats({ ledger_capacity_usage: "0.73" })
    );

    const result = await getFeeEstimate();

    expect(result.ledgerCapacityUsagePct).toBe(73);
  });

  it("propagates the underlying Horizon error instead of swallowing it", async () => {
    vi.spyOn(server, "feeStats").mockRejectedValue(new Error("Horizon unreachable"));

    await expect(getFeeEstimate()).rejects.toThrow("Horizon unreachable");
  });
});
