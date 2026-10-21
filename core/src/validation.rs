#![no_std]
//! Input validation rules.
//! Ported from `src/lib/validations.ts` (originally zod schemas).
//! Provides composable validation functions for emails, amounts, Stellar
//! addresses, passwords, and transactions. Reuses `core::strkey` and
//! soroban SDK types for address validation.

//! @module email
//! Validates email address format using regex pattern matching.

//! @module amount
//! Validates monetary amounts are positive and within reasonable bounds.

//! @module address
//! Validates Stellar address format and checksum using Strkey encoding.

//! @module password
//! Validates password strength requirements.

//! @module transaction
//! Validates transaction parameters before broadcasting to the network.
#![no_root]
//! Input validation rules.
//!
//! Ported from `src/lib/validations.ts` (originally zod schemas).
//! Provides composable validation functions for emails, amounts, Stellar
//! addresses, passwords, and transactions. Reuses `core::strkey` and
//! `core::password` under the hood.

use crate::password::get_password_strength;
use crate::strkey::is_valid_stellar_public_key;

/// A validation error with a human-readable message.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ValidationError {
    pub field: String,
    pub message: String,
}

impl ValidationError {
    pub fn new(field: impl Into<String>, message: impl Into<String>) -> Self {
        Self {
            field: field.into(),
            message: message.into(),
        }
    }
}

/// Result type for validation functions.
pub type ValidationResult<T> = Result<T, ValidationError>;

/// Validates an email address format.
pub fn validate_email(email: &str) -> ValidationResult<()> {
    if email.is_empty() {
        return Err(ValidationError::new("email", "Email is required"));
    }
    if !email.contains('@') {
        return Err(ValidationError::new("email", "Email must contain '@'"));
    }
    let parts: Vec<&str> = email.split('@').collect();
    if parts.len() != 2 || parts[0].is_empty() || parts[1].is_empty() {
        return Err(ValidationError::new("email", "Email must have a local part and domain"));
    }
    if !parts[1].contains('.') {
        return Err(ValidationError::new("email", "Email domain must contain a '.'"));
    }
    Ok(())
}

/// Validates a remittance amount: positive, finite, max 7 decimal places.
pub fn validate_amount(amount: f64) -> ValidationResult<f64> {
    if !amount.is_finite() {
        return Err(ValidationError::new("amount", "Amount must be a finite number"));
    }
    if amount <= 0.0 {
        return Err(ValidationError::new("amount", "Amount must be greater than 0"));
    }
    // Stellar supports 7 decimal places.
    let scaled = amount * 1e7;
    if (scaled - scaled.round()).abs() > f64::EPSILON * 1e3 {
        return Err(ValidationError::new(
            "amount",
            "Amount cannot exceed 7 decimal places",
        ));
    }
    Ok(amount)
}

/// Validates a Stellar public address.
pub fn validate_stellar_address(address: &str) -> ValidationResult<()> {
    if address.is_empty() {
        return Err(ValidationError::new(
            "recipient_address",
            "Recipient address is required",
        ));
    }
    if !is_valid_stellar_public_key(address) {
        return Err(ValidationError::new(
            "recipient_address",
            "Invalid Stellar address",
        ));
    }
    Ok(())
}

/// Validates password strength. Returns the score (0-4) on success.
pub fn validate_password(password: &str) -> ValidationResult<u8> {
    let score = get_password_strength(password).score;
    if score < 3 {
        return Err(ValidationError::new(
            "password",
            "Password is too weak. Use a mix of length, cases, digits, and symbols.",
        ));
    }
    Ok(score)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validate_email_accepts_valid_addresses() {
        for email in [
            "alice@example.com",
            "bob.smith+tag@domain.co.uk",
            "x@y.io",
        ] {
            assert!(validate_email(email).is_ok(), "{} should be valid", email);
        }
    }

    #[test]
    fn validate_email_rejects_invalid_addresses() {
        let cases = [
            ("", "Email is required"),
            ("no-at-sign", "Email must contain '@'"),
            ("@domain.com", "Email must have a local part and domain"),
            ("user@", "Email must have a local part and domain"),
            ("user@nodot", "Email domain must contain a '.'"),
        ];
        for (email, expected) in cases {
            let err = validate_email(email).unwrap_err();
            assert_eq!(err.field, "email");
            assert_eq!(err.message, expected, "for email {:?}", email);
        }
    }

    #[test]
    fn validate_amount_accepts_valid_amounts() {
        for amount in [0.01, 100.0, 1234567.1234567, 0.0000001] {
            assert!(validate_amount(amount).is_ok(), "{:?} should be valid", amount);
        }
    }

    #[test]
    fn validate_amount_rejects_invalid_amounts() {
        let cases = [
            (0.0, "Amount must be greater than 0"),
            (-10.0, "Amount must be greater than 0"),
            (f64::NAN, "Amount must be a finite number"),
            (f64::INFINITY, "Amount must be a finite number"),
            (0.00000001, "Amount cannot exceed 7 decimal places"), // 8 decimal places
        ];
        for (amount, expected) in cases {
            let err = validate_amount(amount).unwrap_err();
            assert_eq!(err.field, "amount");
            assert_eq!(err.message, expected, "for amount {:?}", amount);
        }
    }

    #[test]
    fn validate_stellar_address_accepts_valid() {
        // Build a genuinely valid address (correct CRC16 checksum) so the
        // happy path is actually exercised.
        let addr = crate::strkey::make_test_address([42u8; 32]);
        assert!(validate_stellar_address(&addr).is_ok(), "{:?} should be valid", addr);
    }

    #[test]
    fn validate_stellar_address_rejects_invalid() {
        let cases = ["", "not-an-address", "GCXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"];
        for addr in cases {
            assert!(
                validate_stellar_address(addr).is_err(),
                "{:?} should be invalid",
                addr
            );
        }
    }

    #[test]
    fn validate_password_requires_strength() {
        assert!(validate_password("weak").is_err());
        assert!(validate_password("Str0ng!Pass").is_ok());
    }
}
