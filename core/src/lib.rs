//! RemitX core business logic.
//!
//! This crate ports the deterministic, I/O-free business logic that used to
//! live only in the Next.js TypeScript backend (`src/lib/`) into a single,
//! testable Rust library. Keeping it in one place means the client's
//! "is this valid?" gates and the server's actual enforcement can never drift
//! apart, and the exact same logic can be compiled to WebAssembly and run in
//! the browser or on the server.
//!
//! Modules:
//!   * [`password`]  — password-strength scoring (shared by the UI meter and API)
//!   * [`strkey`]    — Stellar StrKey (`G...`) validation incl. CRC16 checksum
//!   * [`anchors`]   — curated SEP-24 anchor directory, filtering, and fee math
//!   * [`validation`]— request-field validation rules (registration, send, etc.)
//!   * [`rates`]     — exchange-rate resolution, caching, and fixed-point math
//!   * [`security`]  — rate limiting, CSRF, sanitization, account lockout,
//!   * [`types`]     — shared row/domain types mirroring the Supabase schema
//!   * [`jwt`]       — HS256 JWT signing and verification (session tokens)
//!   * [`auth`]      — bcrypt password hashing and verification
//!   * [`turnstile`] — Cloudflare Turnstile verification decision logic

pub mod anchors;
pub mod auth;
pub mod jwt;
pub mod password;
pub mod rates;
pub mod security;
pub mod strkey;
pub mod turnstile;
pub mod types;
pub mod validation;

pub use anchors::{estimate_fee, list_anchors, Anchor, AnchorFilters};
pub use password::{get_password_strength, PasswordCheck, PasswordStrength, MIN_PASSWORD_SCORE};
pub use rates::{convert, default_fetch, now_seconds, RateCache, RateEntry, RateError};
pub use security::{
    generate_reset_token, is_allowed_origin, sanitize_email, sanitize_input, security_headers,
    validate_reset_token, ALLOWED_ORIGINS, ALLOWED_UPLOAD_TYPES, MAX_REQUEST_SIZE, MAX_UPLOAD_SIZE,
};
pub use strkey::{check_stellar_public_key, is_valid_stellar_public_key, StellarAddressCheck};
pub use validation::{
    validate_amount, validate_email, validate_password, validate_stellar_address, ValidationError,
    ValidationResult,
};
pub use jwt::{sign_token, verify_token, SessionPayload};
pub use auth::{hash_password, verify_password, SALT_ROUNDS};
