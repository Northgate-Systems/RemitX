// Shared currency-formatting helpers. Before this, every page rolled its own
// `parseFloat(x).toFixed(2)` (or 4, or nothing) and stitched the currency
// ticker on by hand, so decimal precision and locale drifted between the
// dashboard, send page, and anchors table.

// Stellar asset tickers (XLM, USDC, ...) aren't real ISO 4217 currency codes,
// so Intl's `style: "currency"` can't render them -- they get a plain
// "<amount> <CODE>" display instead of a locale currency symbol.
const FIAT_CODES = new Set(["USD", "EUR", "GBP"]);

const CRYPTO_DECIMALS: Record<string, number> = {
  XLM: 2,
};
const DEFAULT_CRYPTO_DECIMALS = 2;

function toNumber(amount: number | string): number {
  const numeric = typeof amount === "string" ? parseFloat(amount) : amount;
  return Number.isFinite(numeric) ? numeric : 0;
}

/**
 * Format just the numeric part of an amount (locale-aware grouping/decimals),
 * with no currency code or symbol attached. Use this where the code/ticker is
 * already rendered separately (e.g. its own <select> or a differently-styled
 * sibling element) so it isn't duplicated.
 */
export function formatAmount(amount: number | string, currencyCode: string, locale = "en-US"): string {
  const decimals = CRYPTO_DECIMALS[currencyCode.toUpperCase()] ?? DEFAULT_CRYPTO_DECIMALS;
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(toNumber(amount));
}

/**
 * Format an amount together with its currency as a single display string:
 * "$12.34" for recognized fiat ISO codes (via Intl's currency style), or
 * "1,234.56 XLM" for Stellar asset tickers.
 */
export function formatCurrency(amount: number | string, currencyCode: string, locale = "en-US"): string {
  const code = currencyCode.toUpperCase();
  if (FIAT_CODES.has(code)) {
    return new Intl.NumberFormat(locale, { style: "currency", currency: code }).format(toNumber(amount));
  }
  return `${formatAmount(amount, code, locale)} ${code}`;
}
