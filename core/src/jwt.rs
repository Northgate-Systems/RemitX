//! HS256 JWT verification and signing for RemitX session tokens.
//!
//! Ported from `src/lib/jwt.ts` (edge-safe JWT verification) and the
//! JWT portions of `src/lib/auth.ts` (sign/verify). Uses HMAC-SHA256
//! with base64url encoding — the same algorithm as the TypeScript
//! originals — so Rust-issued and TypeScript-issued tokens are
//! interoperable.

use base64::Engine;
use hmac::{Hmac, Mac};
use serde::{Deserialize, Serialize};
use sha2::Sha256;

type HmacSha256 = Hmac<Sha256>;

/// JWT secret, matching `JWT_SECRET` in the TypeScript auth layer.
const JWT_SECRET: &[u8] = b"dev-jwt-secret-change-in-production-min-32-chars-long";

/// Session token payload, matching `src/lib/jwt.ts::SessionPayload`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionPayload {
    pub sub: String,
    pub email: String,
}

/// Verify an HS256 session JWT. Returns the payload on success, `None`
/// when the token is missing, malformed, expired, or has a bad signature.
pub fn verify_token(token: &str) -> Option<SessionPayload> {
    let parts: Vec<&str> = token.split('.').collect();
    if parts.len() != 3 {
        return None;
    }
    let [encoded_header, encoded_payload, encoded_signature] = parts[..] else {
        return None;
    };

    let signing_input = format!("{}.{}", encoded_header, encoded_payload);
    let signature_bytes = match base64_url_decode(encoded_signature) {
        Some(b) => b,
        None => return None,
    };

    let key = HmacSha256::new_from_slice(JWT_SECRET)
        .expect("HMAC accepts any key length");
    let mut mac = key.clone();
    mac.update(signing_input.as_bytes());
    let expected = mac.finalize().into_bytes();

    if !constant_time_eq(&signature_bytes, &expected) {
        return None;
    }

    let payload_json = match base64_url_decode(encoded_payload) {
        Some(b) => String::from_utf8_lossy(&b).to_string(),
        None => return None,
    };
    let payload: serde_json::Value = match serde_json::from_str(&payload_json) {
        Ok(v) => v,
        Err(_) => return None,
    };

    let sub = payload.get("sub")?.as_str()?;
    let email = payload.get("email")?.as_str()?;

    if let Some(exp) = payload.get("exp").and_then(|v| v.as_u64()) {
        if exp * 1000 < now_ms() {
            return None;
        }
    }

    Some(SessionPayload {
        sub: sub.to_string(),
        email: email.to_string(),
    })
}

/// Sign an HS256 JWT with the given payload, expiring in 7 days.
pub fn sign_token(sub: &str, email: &str, session_version: u64) -> String {
    let header = base64_url_encode(r#"{"alg":"HS256","typ":"JWT"}"#.as_bytes());
    let now = now_ms();
    let exp = now + 7 * 24 * 60 * 60 * 1000; // 7 days
    let payload = serde_json::json!({
        "sub": sub,
        "email": email,
        "sv": session_version,
        "iat": now / 1000,
        "exp": exp / 1000,
    });
    let encoded_payload = base64_url_encode(serde_json::to_string(&payload).unwrap().as_bytes());
    let signing_input = format!("{}.{}", header, encoded_payload);

    let mut mac = HmacSha256::new_from_slice(JWT_SECRET)
        .expect("HMAC accepts any key length");
    mac.update(signing_input.as_bytes());
    let signature = mac.finalize().into_bytes();
    let encoded_signature = base64_url_encode(&signature);

    format!("{}.{}.{}", header, encoded_payload, encoded_signature)
}

/// Constant-time equality check to prevent timing attacks.
fn constant_time_eq(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    let mut result = 0u8;
    for (x, y) in a.iter().zip(b.iter()) {
        result |= x ^ y;
    }
    result == 0
}

/// Base64url-decode (no padding).
fn base64_url_decode(input: &str) -> Option<Vec<u8>> {
    base64::engine::general_purpose::URL_SAFE_NO_PAD.decode(input).ok()
}

/// Base64url-encode (no padding).
fn base64_url_encode(bytes: &[u8]) -> String {
    base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(bytes)
}

/// Current time in milliseconds since the Unix epoch.
fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .expect("clock before Unix epoch")
        .as_millis() as u64
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sign_and_verify_roundtrip() {
        let token = sign_token("user-123", "alice@example.com", 1);
        let payload = verify_token(&token).expect("valid token should verify");
        assert_eq!(payload.sub, "user-123");
        assert_eq!(payload.email, "alice@example.com");
    }

    #[test]
    fn verify_rejects_tampered_payload() {
        let token = sign_token("user-123", "alice@example.com", 1);
        let parts: Vec<&str> = token.split('.').collect();
        let tampered = format!("{}.{}.bad_sig", parts[0], parts[1]);
        assert!(verify_token(&tampered).is_none());
    }

    #[test]
    fn verify_rejects_malformed_token() {
        assert!(verify_token("").is_none());
        assert!(verify_token("not-a-token").is_none());
        assert!(verify_token("a.b").is_none());
        assert!(verify_token("a.b.c.d").is_none());
    }

    #[test]
    fn verify_rejects_bad_base64() {
        assert!(verify_token("!!!@@@###").is_none());
    }

    #[test]
    fn verify_expired_token_is_rejected() {
        let header = base64_url_encode(r#"{"alg":"HS256","typ":"JWT"}"#.as_bytes());
        let past = (now_ms() / 1000) - 10_000; // 10 seconds ago
        let payload = serde_json::json!({
            "sub": "user-123",
            "email": "alice@example.com",
            "exp": past,
        });
        let encoded_payload = base64_url_encode(
            serde_json::to_string(&payload).unwrap().as_bytes(),
        );
        let signing_input = format!("{}.{}", header, encoded_payload);
        let mut mac = HmacSha256::new_from_slice(JWT_SECRET)
            .expect("HMAC accepts any key length");
        mac.update(signing_input.as_bytes());
        let signature = mac.finalize().into_bytes();
        let encoded_signature = base64_url_encode(&signature);
        let token = format!("{}.{}.{}", header, encoded_payload, encoded_signature);

        assert!(verify_token(&token).is_none());
    }

    #[test]
    fn verify_accepts_token_without_exp() {
        let header = base64_url_encode(r#"{"alg":"HS256","typ":"JWT"}"#.as_bytes());
        let payload = serde_json::json!({
            "sub": "user-123",
            "email": "alice@example.com",
        });
        let encoded_payload = base64_url_encode(
            serde_json::to_string(&payload).unwrap().as_bytes(),
        );
        let signing_input = format!("{}.{}", header, encoded_payload);
        let mut mac = HmacSha256::new_from_slice(JWT_SECRET)
            .expect("HMAC accepts any key length");
        mac.update(signing_input.as_bytes());
        let signature = mac.finalize().into_bytes();
        let encoded_signature = base64_url_encode(&signature);
        let token = format!("{}.{}.{}", header, encoded_payload, encoded_signature);

        assert!(verify_token(&token).is_some());
    }

    #[test]
    fn constant_time_eq_rejects_different_lengths() {
        assert!(!constant_time_eq(b"short", b"longer"));
    }

    #[test]
    fn constant_time_eq_rejects_different_content() {
        assert!(!constant_time_eq(b"abcde", b"abcdf"));
    }

    #[test]
    fn constant_time_eq_accepts_identical() {
        assert!(constant_time_eq(b"identical", b"identical"));
    }
}