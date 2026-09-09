import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// rates.ts keeps its rate cache and its ExchangeRate-API response cache as
// module-level singletons (by design - "NO DATABASE NEEDED"). That means
// state leaks between tests unless each test gets its own fresh module
// instance, so every test re-imports via this helper instead of a
// top-level `import`.
async function freshRatesModule() {
  vi.resetModules();
  return import("../rates");
}

function mockFetchJson(payload: unknown, status = 200) {
  vi.mocked(fetch).mockImplementation(() =>
    Promise.resolve(new Response(JSON.stringify(payload), { status }))
  );
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("getRate", () => {
  it("returns 1 immediately for identical from/to assets without touching the network", async () => {
    const { getRate } = await freshRatesModule();
    const result = await getRate("USD", "USD");
    expect(result.rate).toBe("1.000000");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("fetches a crypto->USD rate from CoinGecko and serves the second lookup from cache", async () => {
    const { getRate } = await freshRatesModule();
    mockFetchJson({ stellar: { usd: 0.12 } });

    const first = await getRate("XLM", "USD");
    expect(first.source).toBe("api");
    expect(first.rate).toBe("0.120000");
    expect(fetch).toHaveBeenCalledTimes(1);

    const second = await getRate("XLM", "USD");
    expect(second.source).toBe("cache");
    expect(second.rate).toBe("0.120000");
    expect(fetch).toHaveBeenCalledTimes(1); // no new network call
  });

  it("fetches a fiat rate from ExchangeRate-API and inverts units-per-USD into USD-per-unit", async () => {
    const { getRate } = await freshRatesModule();
    mockFetchJson({ rates: { NGN: 1600 } });

    const result = await getRate("NGN", "USD");
    expect(result.source).toBe("api");
    // ExchangeRate-API gives "1 USD = 1600 NGN"; callers need "1 NGN = X USD".
    expect(result.rate).toBe((1 / 1600).toFixed(6));
  });

  it("shares one underlying ExchangeRate-API response across different fiat lookups within the TTL", async () => {
    const { getRate } = await freshRatesModule();
    mockFetchJson({ rates: { NGN: 1600, KES: 129 } });

    await getRate("NGN", "USD");
    await getRate("KES", "USD");

    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("expires the per-pair cache after the 5-minute TTL and fetches again", async () => {
    vi.useFakeTimers();
    const { getRate } = await freshRatesModule();
    mockFetchJson({ stellar: { usd: 0.1 } });

    const first = await getRate("XLM", "USD");
    expect(first.source).toBe("api");
    expect(fetch).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(5 * 60 * 1000 + 1);

    const second = await getRate("XLM", "USD");
    expect(second.source).toBe("api");
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("falls back to a hardcoded rate when the crypto API call fails outright", async () => {
    const { getRate } = await freshRatesModule();
    vi.mocked(fetch).mockRejectedValue(new Error("network down"));

    const result = await getRate("XLM", "USD");
    expect(result.source).toBe("fallback");
    expect(result.rate).toBe("0.1042");
  });

  it("falls back safely when CoinGecko responds 200 but the coin id is missing from the payload", async () => {
    const { getRate } = await freshRatesModule();
    mockFetchJson({});

    const result = await getRate("XLM", "USD");
    expect(result.source).toBe("fallback");
    expect(result.rate).toBe("0.1042");
  });

  it("returns the absolute-last-resort 1.00 for an unsupported pair with no hardcoded fallback", async () => {
    const { getRate } = await freshRatesModule();
    vi.mocked(fetch).mockRejectedValue(new Error("network down"));

    // ETH has no FALLBACK_RATES entry and no ETH->ZAR route hardcoded.
    const result = await getRate("ETH", "ZAR");
    expect(result.source).toBe("fallback");
    expect(result.rate).toBe("1.00");
  });

  it("treats an unrecognized currency code as fiat and degrades to 1.00 instead of throwing", async () => {
    const { getRate } = await freshRatesModule();
    mockFetchJson({ rates: {} });

    const result = await getRate("ZZZ", "USD");
    expect(result.source).toBe("fallback");
    expect(result.rate).toBe("1.00");
  });

  it("returns a fetchedAt ISO timestamp on every branch (cache, api, fallback)", async () => {
    const { getRate } = await freshRatesModule();
    mockFetchJson({ stellar: { usd: 0.12 } });
    const result = await getRate("XLM", "USD");
    expect(() => new Date(result.fetchedAt).toISOString()).not.toThrow();
    expect(result.fromAsset).toBe("XLM");
    expect(result.toAsset).toBe("USD");
  });
});

describe("refreshAllRates", () => {
  it("refreshes every known pair and logs a completion summary", async () => {
    vi.useFakeTimers();
    const { refreshAllRates } = await freshRatesModule();
    mockFetchJson({
      stellar: { usd: 0.1 },
      "usd-coin": { usd: 1 },
      "euro-coin": { usd: 1.09 },
      rates: { NGN: 1600, EUR: 0.92, XAF: 600, XOF: 600, GHS: 15, KES: 129, ZAR: 18 },
    });
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const promise = refreshAllRates();
    await vi.runAllTimersAsync();
    await promise;

    expect(logSpy).toHaveBeenCalledWith("[rates] refreshAllRates complete: 21 ok, 0 failed");
  });

  it("counts every pair as failed (not thrown) when the network is completely down", async () => {
    vi.useFakeTimers();
    const { refreshAllRates } = await freshRatesModule();
    vi.mocked(fetch).mockRejectedValue(new Error("network down"));
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const promise = refreshAllRates();
    await vi.runAllTimersAsync();
    await promise;

    // refreshAllRates calls resolveRateThroughUsd() directly (not getRate()),
    // so FALLBACK_RATES never kicks in here - a fully dead network means
    // every one of the 21 pairs fails to resolve, but the function still
    // completes instead of throwing.
    expect(logSpy).toHaveBeenCalledWith("[rates] refreshAllRates complete: 0 ok, 21 failed");
  });
});
