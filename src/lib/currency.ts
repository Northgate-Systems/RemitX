/**
 * Money-safe helpers for the send flow's amount input.
 *
 * The problem this fixes: `parseFloat(amount)` immediately converts a
 * decimal string into an IEEE754 double, which can silently lose
 * precision even for perfectly normal-looking money amounts. This isn't
 * hypothetical - `(1.005).toFixed(2)` returns `"1.00"` in every JS
 * engine, not `"1.01"`, because the literal `1.005` can't be represented
 * exactly in binary floating point and rounds down before `toFixed` ever
 * sees it. `send/page.tsx` did exactly this: `parseFloat(amount)` for the
 * amount the user typed, then `numericAmount * parseFloat(rate)`, then
 * `.toFixed(2)` for display - three separate places for binary rounding
 * error to creep in, on values a user is about to send irreversibly over
 * Stellar.
 *
 * The fix here is to keep the amount as an *integer* count of minor
 * units (cents, for a 2-decimal currency) for as long as possible, and
 * only ever produce that integer via direct string manipulation of the
 * decimal string - never via `parseFloat`. Converting the exchange rate
 * still needs a float multiply (the rate itself is inherently a
 * floating-point quantity from the API), but at least the amount side of
 * the multiplication is exact.
 */

const DEFAULT_DECIMALS = 2;

/** A plain non-negative decimal number: "100", "100.5", "100.50". No
 * sign, no exponent ("1e5"), no thousands separators - anything else is
 * not a value this UI should accept into an amount field. */
const PLAIN_DECIMAL_RE = /^\d+(\.\d+)?$/;

export function isPlainDecimal(raw: string): boolean {
  return PLAIN_DECIMAL_RE.test(raw.trim());
}

/**
 * Converts a decimal amount string into an integer count of minor units
 * by splitting on the decimal point and concatenating the digits -
 * never by parsing the string into a float first. Returns `null` for
 * anything that isn't a plain non-negative decimal, or that carries more
 * fractional digits than `decimals` supports (silently truncating would
 * hide a mistake; better to reject and let the caller ask again).
 */
export function toMinorUnits(raw: string, decimals: number = DEFAULT_DECIMALS): number | null {
  const trimmed = raw.trim();
  if (!isPlainDecimal(trimmed)) return null;
  const [whole, fraction = ""] = trimmed.split(".");
  if (fraction.length > decimals) return null;
  const minorDigits = whole + fraction.padEnd(decimals, "0");
  const minor = Number(minorDigits);
  return Number.isSafeInteger(minor) ? minor : null;
}

/** The inverse of `toMinorUnits`: an integer count of minor units back
 * into a fixed-decimal string, e.g. `fromMinorUnits(10050) === "100.50"`. */
export function fromMinorUnits(minor: number, decimals: number = DEFAULT_DECIMALS): string {
  const whole = Math.trunc(minor);
  const sign = whole < 0 ? "-" : "";
  const abs = Math.abs(whole);
  if (decimals === 0) return `${sign}${abs}`;
  const divisor = 10 ** decimals;
  const wholePart = Math.floor(abs / divisor);
  const fractionPart = (abs % divisor).toString().padStart(decimals, "0");
  return `${sign}${wholePart}.${fractionPart}`;
}

/**
 * Converts an exact integer amount (in minor units) through a floating
 * exchange rate, rounding to the nearest minor unit exactly once. This
 * is the same rounding a naive `(amount * rate).toFixed(2)` does in the
 * common case, but it doesn't compound a *second* source of float error
 * from parsing the amount itself through `parseFloat` first - the amount
 * here was never anything but an exact integer.
 */
export function convertMinorUnits(amountMinor: number, rate: number): number {
  return Math.round(amountMinor * rate);
}

/**
 * Sanitizes a raw amount input as the user types: strips anything that
 * isn't a digit or a decimal point, collapses multiple decimal points
 * down to the first one, and truncates extra fractional digits beyond
 * `decimals`. This keeps what's shown in the field always equal to what
 * `toMinorUnits` will accept - no scientific notation, no surprises
 * between what the user sees and what gets sent to the API.
 */
export function sanitizeAmountInput(raw: string, decimals: number = DEFAULT_DECIMALS): string {
  let cleaned = raw.replace(/[^\d.]/g, "");
  const firstDot = cleaned.indexOf(".");
  if (firstDot !== -1) {
    cleaned = cleaned.slice(0, firstDot + 1) + cleaned.slice(firstDot + 1).replace(/\./g, "");
  }
  const [whole, fraction] = cleaned.split(".");
  if (fraction !== undefined && fraction.length > decimals) {
    cleaned = decimals > 0 ? `${whole}.${fraction.slice(0, decimals)}` : whole;
  }
  return cleaned;
}
