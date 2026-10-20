//! Stellar StrKey (`G...`) validation, including the CRC16 checksum.
//!
//! Ported from `src/lib/stellar-address.ts`. A `G` address is
//! base32 (RFC 4648, no padding) over 35 bytes:
//!   * `[0]`      version byte (`6 << 3` for an ed25519 public key)
//!   * `[1..32]`  32-byte ed25519 public key
//!   * `[33..34]` CRC16-XModem of the preceding 33 bytes, little-endian
//!
//! Kept dependency-free so it can run in a browser component and be compiled to
//! WebAssembly without dragging the full Stellar SDK into the bundle.

use serde::{Deserialize, Serialize};

const ED25519_PUBLIC_KEY_VERSION_BYTE: u8 = 6 << 3; // 0x30 — base32-encodes to a leading "G"
const DECODED_LENGTH: usize = 35; // 1 version byte + 32-byte payload + 2-byte checksum

/// Length of a `G...` address. 35 bytes * 8 / 5 = 56 base32 chars, no padding.
pub const STELLAR_PUBLIC_KEY_LENGTH: usize = 56;

/// The specific reason an address failed validation.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum StellarAddressProblem {
    Empty,
    Prefix,
    TooShort,
    TooLong,
    Charset,
    Checksum,
}

/// Result of validating an address, including a human-readable message.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct StellarAddressCheck {
    pub valid: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub problem: Option<StellarAddressProblem>,
    /// Human-readable, safe to show directly under the input.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}

impl StellarAddressCheck {
    fn ok() -> Self {
        StellarAddressCheck { valid: true, problem: None, message: None }
    }
    fn fail(problem: StellarAddressProblem, message: &str) -> Self {
        StellarAddressCheck {
            valid: false,
            problem: Some(problem),
            message: Some(message.to_string()),
        }
    }
}

/// CRC16-XModem (poly 0x1021, init 0x0000) — the checksum Stellar StrKeys use.
/// This is a bit-for-bit port of the JavaScript implementation so results match.
fn crc16_xmodem(bytes: &[u8]) -> u16 {
    let mut crc: u32 = 0x0000;
    for &b in bytes {
        let mut code: u32 = (crc >> 8) & 0xff;
        code ^= (b & 0xff) as u32;
        code ^= code >> 4;
        crc = (crc << 8) & 0xffff;
        crc ^= code;
        code = (code << 5) & 0xffff;
        crc ^= code;
        code = (code << 7) & 0xffff;
        crc ^= code;
    }
    (crc & 0xffff) as u16
}

fn base32_digit(ch: char) -> Option<u32> {
    // "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567" → A=0..Z=25, 2=26..7=31
    match ch {
        'A'..='Z' => Some((ch as u32) - ('A' as u32)),
        '2'..='7' => Some(26 + ((ch as u32) - ('2' as u32))),
        _ => None,
    }
}

/// Decode exactly 56 base32 characters into 35 bytes. Returns `None` on any
/// character outside the base32 alphabet or a wrong decoded length.
fn decode_base32(input: &str) -> Option<[u8; DECODED_LENGTH]> {
    let mut out = [0u8; DECODED_LENGTH];
    let mut value: u32 = 0;
    let mut bits: u32 = 0;
    let mut index: usize = 0;

    for ch in input.chars() {
        let digit = base32_digit(ch)?;
        value = (value << 5) | digit;
        bits += 5;
        if bits >= 8 {
            if index >= DECODED_LENGTH {
                return None;
            }
            out[index] = ((value >> (bits - 8)) & 0xff) as u8;
            index += 1;
            bits -= 8;
        }
    }

    if index == DECODED_LENGTH { Some(out) } else { None }
}

/// Validate a Stellar ed25519 public key, checksum included. Returns *why* it
/// failed so the UI can distinguish a mistyped character from a truncated paste.
pub fn check_stellar_public_key(address: &str) -> StellarAddressCheck {
    let value = address.trim();

    if value.is_empty() {
        return StellarAddressCheck::fail(
            StellarAddressProblem::Empty,
            "Enter the recipient's Stellar address.",
        );
    }
    if !value.starts_with('G') {
        return StellarAddressCheck::fail(
            StellarAddressProblem::Prefix,
            "Stellar addresses start with \u{201c}G\u{201d}. Secret keys (\u{201c}S\u{2026}) must never be pasted here.",
        );
    }
    if value.len() < STELLAR_PUBLIC_KEY_LENGTH {
        return StellarAddressCheck::fail(
            StellarAddressProblem::TooShort,
            &format!(
                "This address is {} characters \u{2014} a Stellar address is {}. It looks like part of it is missing.",
                value.len(),
                STELLAR_PUBLIC_KEY_LENGTH
            ),
        );
    }
    if value.len() > STELLAR_PUBLIC_KEY_LENGTH {
        return StellarAddressCheck::fail(
            StellarAddressProblem::TooLong,
            &format!(
                "This address is {} characters \u{2014} a Stellar address is {}. Check for extra characters from the copy.",
                value.len(),
                STELLAR_PUBLIC_KEY_LENGTH
            ),
        );
    }

    let decoded = match decode_base32(value) {
        Some(d) => d,
        None => {
            return StellarAddressCheck::fail(
                StellarAddressProblem::Charset,
                "This address contains characters that can't appear in a Stellar address (0, 1, 8, 9 and lowercase letters are never used).",
            );
        }
    };

    if decoded[0] != ED25519_PUBLIC_KEY_VERSION_BYTE {
        return StellarAddressCheck::fail(
            StellarAddressProblem::Prefix,
            "This isn't a Stellar account address.",
        );
    }

    let expected =
        u16::from(decoded[DECODED_LENGTH - 2]) | (u16::from(decoded[DECODED_LENGTH - 1]) << 8);
    if crc16_xmodem(&decoded[..DECODED_LENGTH - 2]) != expected {
        return StellarAddressCheck::fail(
            StellarAddressProblem::Checksum,
            "This address fails its checksum \u{2014} it's the right shape but at least one character is wrong. Re-copy it from the recipient.",
        );
    }

    StellarAddressCheck::ok()
}

/// Convenience boolean wrapper for callers that don't need the reason.
pub fn is_valid_stellar_public_key(address: &str) -> bool {
    check_stellar_public_key(address).valid
}

#[cfg(test)]
mod tests {
    use super::*;

    // --- Test-only helpers to build a genuinely valid address ---------------

    fn encode_base32(bytes: &[u8]) -> String {
        let alphabet = b"ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
        let mut out = String::new();
        let mut value: u32 = 0;
        let mut bits: u32 = 0;
        for &b in bytes {
            value = (value << 8) | u32::from(b);
            bits += 8;
            while bits >= 5 {
                out.push(alphabet[((value >> (bits - 5)) & 31) as usize] as char);
                bits -= 5;
            }
        }
        if bits > 0 {
            out.push(alphabet[((value << (5 - bits)) & 31) as usize] as char);
        }
        out
    }

    /// Assemble a valid StrKey `G...` address from a 32-byte ed25519 pubkey.
    fn make_address(pubkey: [u8; 32]) -> String {
        let mut data = [0u8; 33];
        data[0] = ED25519_PUBLIC_KEY_VERSION_BYTE;
        data[1..33].copy_from_slice(&pubkey);
        let checksum = crc16_xmodem(&data);
        let mut full = [0u8; 35];
        full[..33].copy_from_slice(&data);
        full[33] = (checksum & 0xff) as u8; // little-endian checksum
        full[34] = (checksum >> 8) as u8;
        encode_base32(&full)
    }

    #[test]
    fn crc16_reference_vector() {
        // CRC16-XModem("123456789") == 0x31C3 — the standard check value.
        assert_eq!(crc16_xmodem(b"123456789"), 0x31C3);
    }

    #[test]
    fn base32_encode_decode_roundtrip() {
        let data = [0x30u8; 35];
        let encoded = encode_base32(&data);
        assert_eq!(encoded.len(), STELLAR_PUBLIC_KEY_LENGTH);
        assert_eq!(decode_base32(&encoded).unwrap(), data);
    }

    #[test]
    fn base32_all_zeros_is_all_a() {
        let encoded = encode_base32(&[0u8; 35]);
        assert_eq!(encoded, "A".repeat(STELLAR_PUBLIC_KEY_LENGTH));
    }

    #[test]
    fn valid_address_passes() {
        let addr = make_address([7u8; 32]);
        assert_eq!(addr.len(), STELLAR_PUBLIC_KEY_LENGTH);
        assert!(addr.starts_with('G'));
        assert!(is_valid_stellar_public_key(&addr));
        assert!(check_stellar_public_key(&addr).valid);
    }

    #[test]
    fn checksum_covers_whole_payload() {
        // Any change to the embedded pubkey must break the checksum.
        let addr = make_address([7u8; 32]);
        let mut tampered = addr.clone();
        // Flip one data char (position 10) to a different valid base32 char.
        let original = tampered.as_bytes()[10];
        let replacement = if original == b'A' { b'B' } else { b'A' };
        tampered.replace_range(10..11, &(replacement as char).to_string());
        assert!(!is_valid_stellar_public_key(&tampered));
    }

    #[test]
    fn empty_and_prefix_are_rejected() {
        assert_eq!(check_stellar_public_key("").problem, Some(StellarAddressProblem::Empty));
        // Secret-key style input (starts with S) → prefix problem.
        let secret = format!("S{}", &make_address([7u8; 32])[1..]);
        assert_eq!(check_stellar_public_key(&secret).problem, Some(StellarAddressProblem::Prefix));
    }

    #[test]
    fn length_problems_are_distinguished() {
        assert_eq!(check_stellar_public_key("GBRPYHIL").problem, Some(StellarAddressProblem::TooShort));
        let long = format!("{}A", make_address([7u8; 32]));
        assert_eq!(check_stellar_public_key(&long).problem, Some(StellarAddressProblem::TooLong));
    }

    #[test]
    fn illegal_characters_report_charset() {
        let mut bad = make_address([7u8; 32]);
        bad.replace_range(5..6, "0"); // '0' is never in the base32 alphabet
        assert_eq!(check_stellar_public_key(&bad).problem, Some(StellarAddressProblem::Charset));
    }

    #[test]
    fn lowercase_is_charset_error() {
        // Lowercase 'g' fails the prefix check before charset is even reached.
        let lower = make_address([7u8; 32]).to_lowercase();
        assert_eq!(
            check_stellar_public_key(&lower).problem,
            Some(StellarAddressProblem::Prefix)
        );
        // But a non-leading lowercase char does hit Charset.
        let mut mid = make_address([7u8; 32]);
        mid.replace_range(10..11, "a");
        assert_eq!(
            check_stellar_public_key(&mid).problem,
            Some(StellarAddressProblem::Charset)
        );
    }

    #[test]
    fn whitespace_is_trimmed() {
        let addr = make_address([7u8; 32]);
        assert!(is_valid_stellar_public_key(&format!("  {}  ", addr)));
    }
}

/// Test-only helper: construct a valid StrKey `G...` address from a 32-byte
/// ed25519 public key. Available only under `--cfg test` so other test
/// modules (e.g. `validation`) can build genuinely valid fixture addresses.
#[cfg(test)]
pub(crate) fn make_test_address(pubkey: [u8; 32]) -> String {
    let mut data = [0u8; 33];
    data[0] = ED25519_PUBLIC_KEY_VERSION_BYTE;
    data[1..33].copy_from_slice(&pubkey);
    let checksum = crc16_xmodem(&data);
    let mut full = [0u8; 35];
    full[..33].copy_from_slice(&data);
    full[33] = (checksum & 0xff) as u8;
    full[34] = (checksum >> 8) as u8;
    encode_base32_test(&full)
}

/// Base32 (RFC 4648, no padding) encoder for test fixtures.
/// Mirrors the one inside `strkey::tests` so `make_test_address` can call it
/// from module level.
#[cfg(test)]
fn encode_base32_test(bytes: &[u8]) -> String {
    const ALPHABET: &[u8; 32] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
    let mut out = String::with_capacity((bytes.len() * 8 + 4) / 5);
    let mut value: u32 = 0;
    let mut bits: u32 = 0;
    for &b in bytes {
        value = (value << 8) | (b as u32);
        bits += 8;
        while bits >= 5 {
            bits -= 5;
            out.push(ALPHABET[((value >> bits) & 0x1f) as usize] as char);
        }
    }
    if bits > 0 {
        out.push(ALPHABET[((value << (5 - bits)) & 0x1f) as usize] as char);
    }
    out
}
