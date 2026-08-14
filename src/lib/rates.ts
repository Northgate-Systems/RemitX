/**
 * Real-World Price Engine for RemitX
 * =====================================
 * Fetches live rates from free public APIs (no API key required),
 * caches them IN MEMORY for consistency across requests, and provides
 * a unified getRate() function used throughout the app.
 *
 * Data sources (FREE, no key needed):
 *   - CoinGecko API          → crypto prices (XLM, USDC, EURC in USD)
 *   - ExchangeRate-API       → forex fiat rates (NGN, XAF, XOF, GHS,
 *                              KES, ZAR, EUR, GBP and 150+ currencies
 *                              against USD)
 *
 * Cache: In-memory Map with 5-minute TTL - NO DATABASE NEEDED.
 * Fallback chain: Memory cache → API fetch → "1.00"
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RateResult {
  rate: string;
  fromAsset: string;
  toAsset: string;
  fetchedAt: string; // ISO timestamp
  source: "cache" | "api" | "fallback";
}

// ---------------------------------------------------------------------------
// In-memory cache (no database, no external service needed!)
// ---------------------------------------------------------------------------

const CACHE_TTL_MS = 300_000; // 5 minutes

interface CacheEntry {
  rate: string;
  fetchedAt: number; // Date.now() milliseconds
}

/** In-memory rate cache: key = "FROM:TO" */
const rateCache = new Map<string, CacheEntry>();

function cacheKey(from: string, to: string): string {
  return `${from.toUpperCase()}:${to.toUpperCase()}`;
}

function getCachedRate(from: string, to: string): CacheEntry | null {
  const entry = rateCache.get(cacheKey(from, to));
  if (!entry) return null;
  const age = Date.now() - entry.fetchedAt;
  if (age < CACHE_TTL_MS) return entry;
  // Expired - remove it
  rateCache.delete(cacheKey(from, to));
  return null;
}

function setCachedRate(from: string, to: string, rate: string): void {
  rateCache.set(cacheKey(from, to), {
    rate,
    fetchedAt: Date.now(),
  });
}

// ---------------------------------------------------------------------------
// Free API helpers (no key required)
// ---------------------------------------------------------------------------

/**
 * CoinGecko simple/price - returns USD value for given coin IDs.
 * https://docs.coingecko.com/reference/simple-price
 */
const COINGECKO_BASE = "https://api.coingecko.com/api/v3";

/** Map Stellar asset codes → CoinGecko coin IDs */
const COINGECKO_ASSET_MAP: Record<string, string> = {
  XLM: "stellar",
  USDC: "usd-coin",
  EURC: "euro-coin",
  BTC: "bitcoin",
  ETH: "ethereum",
};

async function fetchCryptoUsdRate(assetCode: string): Promise<number | null> {
  const coinId = COINGECKO_ASSET_MAP[assetCode];
  if (!coinId) return null;

  try {
    const url = `${COINGECKO_BASE}/simple/price?ids=${coinId}&vs_currencies=usd`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(8_000),
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    const json = await res.json();
    const price = json[coinId]?.usd;
    return typeof price === "number" ? price : null;
  } catch {
    return null;
  }
}

/**
 * ExchangeRate-API - FREE forex rates, NO API KEY required.
 * https://github.com/exchangerate-api/exchangerate-api
 *
 * Supports ALL African currencies: NGN, XAF, XOF, GHS, KES, ZAR, etc.
 * Free tier: 1,500 requests/month (more than enough for on-demand caching).
 *
 * Returns rates for ALL currencies with USD as base, so we cache the
 * entire response to avoid hitting the rate limit on multiple lookups.
 */
const EXCHANGERATE_API = "https://api.exchangerate-api.com/v4/latest/USD";

/** Cache for the full ExchangeRate-API response (all currencies at once) */
let exchangeRateCache: { rates: Record<string, number>; fetchedAt: number } | null = null;

async function fetchAllFiatRates(): Promise<Record<string, number> | null> {
  // Return cached full response if < 5 min old
  if (exchangeRateCache && Date.now() - exchangeRateCache.fetchedAt < CACHE_TTL_MS) {
    return exchangeRateCache.rates;
  }

  try {
    const res = await fetch(EXCHANGERATE_API, {
      signal: AbortSignal.timeout(8_000),
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    const json = await res.json();
    if (!json.rates || typeof json.rates !== "object") return null;

    exchangeRateCache = {
      rates: json.rates as Record<string, number>,
      fetchedAt: Date.now(),
    };
    return exchangeRateCache.rates;
  } catch {
    // Return stale cache if available
    return exchangeRateCache?.rates ?? null;
  }
}

/**
 * Returns how much 1 unit of `currencyCode` is worth in USD.
 *
 * ExchangeRate-API's /latest/USD response gives rates in the OPPOSITE
 * direction - e.g. rates.NGN ≈ 1600 means "1 USD = 1600 NGN", not
 * "1 NGN = 1600 USD". Every non-USD lookup must be inverted to get the
 * "1 unit → USD" value that resolveRateThroughUsd() expects (matching what
 * fetchCryptoUsdRate already returns for crypto assets).
 */
async function fetchFiatUsdRate(currencyCode: string): Promise<number | null> {
  const cur = currencyCode.toUpperCase();
  if (cur === "USD") return 1;

  const allRates = await fetchAllFiatRates();
  if (!allRates) return null;

  const unitsPerUsd = allRates[cur];
  if (typeof unitsPerUsd !== "number" || unitsPerUsd === 0) return null;
  return 1 / unitsPerUsd;
}

// ---------------------------------------------------------------------------
// Known asset classification
// ---------------------------------------------------------------------------

const CRYPTO_ASSETS = new Set(["XLM", "USDC", "EURC", "BTC", "ETH"]);

function isCrypto(code: string): boolean {
  return CRYPTO_ASSETS.has(code.toUpperCase());
}

// ---------------------------------------------------------------------------
// Rate resolution logic
// ---------------------------------------------------------------------------

/**
 * Resolve rate for `fromAsset → toAsset` by routing through USD.
 *
 *   rate(from → to) = rate(from → USD) / rate(to → USD)
 */
async function resolveRateThroughUsd(
  fromAsset: string,
  toAsset: string
): Promise<number | null> {
  const fromUpper = fromAsset.toUpperCase();
  const toUpper = toAsset.toUpperCase();

  if (fromUpper === toUpper) return 1;

  // fromAsset → USD
  let fromToUsd: number | null = null;
  if (fromUpper === "USD") {
    fromToUsd = 1;
  } else if (isCrypto(fromUpper)) {
    fromToUsd = await fetchCryptoUsdRate(fromUpper);
  } else {
    fromToUsd = await fetchFiatUsdRate(fromUpper);
  }
  if (fromToUsd === null) return null;

  // toAsset → USD
  let toToUsd: number | null = null;
  if (toUpper === "USD") {
    toToUsd = 1;
  } else if (isCrypto(toUpper)) {
    toToUsd = await fetchCryptoUsdRate(toUpper);
  } else {
    toToUsd = await fetchFiatUsdRate(toUpper);
  }
  if (toToUsd === null || toToUsd === 0) return null;

  return fromToUsd / toToUsd;
}

// ---------------------------------------------------------------------------
// Hardcoded fallback rates (when APIs are unreachable)
// ---------------------------------------------------------------------------

const FALLBACK_RATES: Record<string, Record<string, string>> = {
  XLM: { USD: "0.1042", USDC: "0.1040", EURC: "0.0960", NGN: "155.50" },
  USDC: { USD: "1.00", XLM: "9.62", EURC: "0.92", NGN: "1495.00" },
  EURC: { USD: "1.09", XLM: "10.48", USDC: "1.09", NGN: "1629.55" },
  USD: { NGN: "1495.00", EUR: "0.92", XAF: "603.57", XOF: "603.57", GHS: "15.30", KES: "129.50", ZAR: "18.20" },
};

function getFallbackRate(from: string, to: string): string | null {
  return FALLBACK_RATES[from]?.[to] ?? null;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Get the exchange rate for `fromAsset → toAsset`.
 *
 * Resolution order:
 *   1. Return fresh in-memory cache (< 5 min) immediately
 *   2. Fetch from live APIs, cache the result, return it
 *   3. Return hardcoded fallback rate (keeps prices realistic when offline)
 *   4. Return "1.00" as absolute last resort
 */
export async function getRate(
  fromAsset: string,
  toAsset: string
): Promise<RateResult> {
  const from = fromAsset.toUpperCase();
  const to = toAsset.toUpperCase();

  // ---- Step 1: Check in-memory cache ----
  const cached = getCachedRate(from, to);
  if (cached) {
    return {
      rate: cached.rate,
      fromAsset: from,
      toAsset: to,
      fetchedAt: new Date(cached.fetchedAt).toISOString(),
      source: "cache",
    };
  }

  // ---- Step 2: Fetch live from APIs ----
  const liveRate = await resolveRateThroughUsd(from, to);
  if (liveRate !== null) {
    const rateStr = liveRate.toFixed(6);
    setCachedRate(from, to, rateStr);
    return {
      rate: rateStr,
      fromAsset: from,
      toAsset: to,
      fetchedAt: new Date().toISOString(),
      source: "api",
    };
  }

  // ---- Step 3: Hardcoded fallback ----
  const fallback = getFallbackRate(from, to);
  if (fallback) {
    console.warn(`[rates] Using hardcoded fallback for ${from}→${to}`);
    setCachedRate(from, to, fallback);
    return {
      rate: fallback,
      fromAsset: from,
      toAsset: to,
      fetchedAt: new Date().toISOString(),
      source: "fallback",
    };
  }

  // ---- Step 4: Absolute last resort ----
  console.warn(
    `[rates] No rate available for ${from}→${to}, returning 1.00`
  );
  return {
    rate: "1.00",
    fromAsset: from,
    toAsset: to,
    fetchedAt: new Date().toISOString(),
    source: "fallback",
  };
}

/**
 * Refresh all known rate pairs in the cache.
 * Can be called on app startup or via cron.
 */
export async function refreshAllRates(): Promise<void> {
  const pairs: [string, string][] = [
    ["XLM", "USD"],
    ["USDC", "USD"],
    ["EURC", "USD"],
    ["XLM", "USDC"],
    ["XLM", "EURC"],
    ["USDC", "EURC"],
    ["USD", "NGN"],
    ["USDC", "NGN"],
    ["USD", "EUR"],
    ["EUR", "NGN"],
    ["EURC", "NGN"],
    ["USDC", "XAF"],
    ["USD", "XAF"],
    ["USDC", "XOF"],
    ["USD", "XOF"],
    ["USDC", "GHS"],
    ["USD", "GHS"],
    ["USDC", "KES"],
    ["USD", "KES"],
    ["USDC", "ZAR"],
    ["USD", "ZAR"],
  ];

  let successCount = 0;
  let failCount = 0;

  for (const [from, to] of pairs) {
    const rate = await resolveRateThroughUsd(from, to);
    if (rate !== null) {
      setCachedRate(from, to, rate.toFixed(6));
      successCount++;
    } else {
      failCount++;
    }
    await new Promise((r) => setTimeout(r, 200));
  }

  console.log(
    `[rates] refreshAllRates complete: ${successCount} ok, ${failCount} failed`
  );
}