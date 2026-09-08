/**
 * Stellar StrKey (`G...`) validation, including the CRC16 checksum.
 *
 * A `G` address is base32(RFC 4648, no padding) over 35 bytes:
 *   [0]      version byte (6 << 3 for an ed25519 public key)
 *   [1..32]  32-byte ed25519 public key
 *   [33..34] CRC16-XModem of the preceding 33 bytes, little-endian
 *
 * `@stellar/stellar-sdk` ships `StrKey`, but that package is a heavy
 * server-side dependency; this module is deliberately dependency-free so it
 * can run in a client component without dragging the SDK into the browser
 * bundle. `src/lib/__tests__/stellar-address.test.ts` cross-checks it against
 * the SDK so the two can't silently diverge.
 */

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const ED25519_PUBLIC_KEY_VERSION_BYTE = 6 << 3; // 0x30 — base32-encodes to a leading "G"
const DECODED_LENGTH = 35; // 1 version byte + 32-byte payload + 2-byte checksum

/** Length of a `G...` address. 35 bytes * 8 / 5 = 56 base32 characters, no padding. */
export const STELLAR_PUBLIC_KEY_LENGTH = 56;

export type StellarAddressProblem =
  | "empty"
  | "prefix"
  | "too-short"
  | "too-long"
  | "charset"
  | "checksum";

export interface StellarAddressCheck {
  valid: boolean;
  problem?: StellarAddressProblem;
  /** Human-readable, safe to show directly under the input. */
  message?: string;
}

/** CRC16-XModem (poly 0x1021, init 0x0000) — the checksum Stellar StrKeys use. */
function crc16Xmodem(bytes: Uint8Array): number {
  let crc = 0x0000;
  for (const byte of bytes) {
    let code = (crc >>> 8) & 0xff;
    code ^= byte & 0xff;
    code ^= code >>> 4;
    crc = (crc << 8) & 0xffff;
    crc ^= code;
    code = (code << 5) & 0xffff;
    crc ^= code;
    code = (code << 7) & 0xffff;
    crc ^= code;
  }
  return crc & 0xffff;
}

/** Decode exactly 56 base32 characters into 35 bytes. Returns null on a
 * character outside the base32 alphabet. */
function decodeBase32(input: string): Uint8Array | null {
  const out = new Uint8Array(DECODED_LENGTH);
  let value = 0;
  let bits = 0;
  let index = 0;

  for (const char of input) {
    const digit = BASE32_ALPHABET.indexOf(char);
    if (digit === -1) return null;
    value = (value << 5) | digit;
    bits += 5;
    if (bits >= 8) {
      out[index++] = (value >>> (bits - 8)) & 0xff;
      bits -= 8;
    }
  }

  return index === DECODED_LENGTH ? out : null;
}

/**
 * Validate a Stellar ed25519 public key, checksum included.
 *
 * Returns *why* it failed so the UI can say something more useful than
 * "invalid address" — a mistyped character and a truncated paste are very
 * different mistakes from the sender's point of view.
 */
export function checkStellarPublicKey(address: string): StellarAddressCheck {
  const value = address.trim();

  if (value.length === 0) {
    return { valid: false, problem: "empty", message: "Enter the recipient's Stellar address." };
  }
  if (value[0] !== "G") {
    return {
      valid: false,
      problem: "prefix",
      message: "Stellar addresses start with “G”. Secret keys (“S…”) must never be pasted here.",
    };
  }
  if (value.length < STELLAR_PUBLIC_KEY_LENGTH) {
    return {
      valid: false,
      problem: "too-short",
      message: `This address is ${value.length} characters — a Stellar address is ${STELLAR_PUBLIC_KEY_LENGTH}. It looks like part of it is missing.`,
    };
  }
  if (value.length > STELLAR_PUBLIC_KEY_LENGTH) {
    return {
      valid: false,
      problem: "too-long",
      message: `This address is ${value.length} characters — a Stellar address is ${STELLAR_PUBLIC_KEY_LENGTH}. Check for extra characters from the copy.`,
    };
  }

  const decoded = decodeBase32(value);
  if (!decoded) {
    return {
      valid: false,
      problem: "charset",
      message: "This address contains characters that can't appear in a Stellar address (0, 1, 8, 9 and lowercase letters are never used).",
    };
  }

  if (decoded[0] !== ED25519_PUBLIC_KEY_VERSION_BYTE) {
    // Unreachable for a "G"-prefixed 56-char string, but keep the check
    // explicit rather than relying on that coincidence.
    return { valid: false, problem: "prefix", message: "This isn't a Stellar account address." };
  }

  const expected = decoded[DECODED_LENGTH - 2] | (decoded[DECODED_LENGTH - 1] << 8);
  if (crc16Xmodem(decoded.subarray(0, DECODED_LENGTH - 2)) !== expected) {
    return {
      valid: false,
      problem: "checksum",
      message: "This address fails its checksum — it's the right shape but at least one character is wrong. Re-copy it from the recipient.",
    };
  }

  return { valid: true };
}

/** Convenience boolean wrapper for callers that don't need the reason. */
export function isValidStellarPublicKey(address: string): boolean {
  return checkStellarPublicKey(address).valid;
}
