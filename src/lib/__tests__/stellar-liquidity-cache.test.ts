import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockCall, mockLiquidityPools } = vi.hoisted(() => {
  const mockCall = vi.fn();
  const mockOrder = vi.fn(() => ({ call: mockCall }));
  const mockLimit = vi.fn(() => ({ order: mockOrder }));
  const mockForAssets = vi.fn(() => ({ limit: mockLimit }));
  const mockLiquidityPools = vi.fn(() => ({ forAssets: mockForAssets }));
  return { mockCall, mockLiquidityPools };
});

vi.mock("@stellar/stellar-sdk", async () => {
  const actual = await vi.importActual<typeof import("@stellar/stellar-sdk")>("@stellar/stellar-sdk");
  return {
    ...actual,
    Horizon: {
      ...actual.Horizon,
      Server: vi.fn().mockImplementation(() => ({
        liquidityPools: mockLiquidityPools,
      })),
    },
  };
});

function poolRecord(id: string, shares = "1000") {
  return {
    id,
    reserves: [
      { asset: "native", amount: "500.0000000" },
      { asset: "USDC:GISSUER", amount: "480.0000000" },
    ],
    total_shares: shares,
  };
}

// Each test imports a fresh copy of src/lib/stellar.ts (vi.resetModules() in
// beforeEach) so the module-private liquidityCache Map starts empty every
// time - without this, the cache from an earlier test would leak into the
// next one and every "does this actually skip Horizon" assertion would be
// meaningless (it'd pass for the wrong reason).
async function freshGetLiquidityPool() {
  const mod = await import("../stellar");
  return mod.getLiquidityPool;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  delete process.env.STELLAR_USDC_ISSUER;
  mockCall.mockResolvedValue({ records: [] });
});

describe("getLiquidityPool", () => {
  it("fetches from Horizon and returns the top pool for a known asset (XLM)", async () => {
    mockCall.mockResolvedValueOnce({ records: [poolRecord("pool-xlm")] });
    const getLiquidityPool = await freshGetLiquidityPool();

    const { result, cached } = await getLiquidityPool("xlm");

    expect(cached).toBe(false);
    expect(result.pool?.id).toBe("pool-xlm");
    expect(result.pool?.totalShares).toBe("1000");
    expect(mockCall).toHaveBeenCalledTimes(1);
  });

  it("serves a second lookup for the same asset from cache without calling Horizon again", async () => {
    mockCall.mockResolvedValueOnce({ records: [poolRecord("pool-xlm")] });
    const getLiquidityPool = await freshGetLiquidityPool();

    const first = await getLiquidityPool("XLM");
    const second = await getLiquidityPool("xlm"); // different case, same asset

    expect(first.cached).toBe(false);
    expect(second.cached).toBe(true);
    expect(second.result.pool?.id).toBe("pool-xlm");
    expect(mockCall).toHaveBeenCalledTimes(1);
  });

  it("caches independently per asset code", async () => {
    mockCall
      .mockResolvedValueOnce({ records: [poolRecord("pool-xlm")] })
      .mockResolvedValueOnce({ records: [] });
    process.env.STELLAR_USDC_ISSUER = "GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN7";
    const getLiquidityPool = await freshGetLiquidityPool();

    const xlm = await getLiquidityPool("XLM");
    const usdc = await getLiquidityPool("USDC");

    expect(xlm.result.pool?.id).toBe("pool-xlm");
    expect(usdc.result.pool).toBeNull();
    expect(usdc.result.reason).toMatch(/No liquidity pool found/);
    expect(mockCall).toHaveBeenCalledTimes(2);
  });

  it("returns pool: null without ever calling Horizon when no issuer is configured", async () => {
    const getLiquidityPool = await freshGetLiquidityPool();

    const { result, cached } = await getLiquidityPool("NOTCONFIGURED");

    expect(cached).toBe(false);
    expect(result.pool).toBeNull();
    expect(result.reason).toMatch(/No issuer configured/);
    expect(mockLiquidityPools).not.toHaveBeenCalled();
  });

  it("also caches the 'no issuer configured' answer so it isn't re-derived every call", async () => {
    const getLiquidityPool = await freshGetLiquidityPool();

    await getLiquidityPool("NOTCONFIGURED");
    const second = await getLiquidityPool("NOTCONFIGURED");

    expect(second.cached).toBe(true);
    expect(second.result.pool).toBeNull();
  });

  it("returns pool: null with a reason when Horizon has no pool for the asset", async () => {
    mockCall.mockResolvedValueOnce({ records: [] });
    const getLiquidityPool = await freshGetLiquidityPool();

    const { result } = await getLiquidityPool("XLM");

    expect(result.pool).toBeNull();
    expect(result.reason).toMatch(/No liquidity pool found for XLM/);
  });
});
