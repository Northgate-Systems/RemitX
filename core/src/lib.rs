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
//!   * [`types`]     — shared row/domain types mirroring the Supabase schema

pub mod anchors;
pub mod password;
pub mod rates;
pub mod strkey;
pub mod types;
pub mod validation;

pub use anchors::{estimate_fee, list_anchors, Anchor, AnchorFilters};
pub use password::{get_password_strength, PasswordCheck, PasswordStrength, MIN_PASSWORD_SCORE};
pub use rates::{convert, default_fetch, now_seconds, RateCache, RateEntry, RateError};
pub use strkey::{check_stellar_public_key, is_valid_stellar_public_key, StellarAddressCheck};
pub use validation::{
    validate_amount, validate_email, validate_password, validate_stellar_address, ValidationError,
    ValidationResult,
};
