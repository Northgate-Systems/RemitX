//! Password hashing and verification, ported from `src/lib/auth.ts`.
//!
//! Uses bcrypt with cost factor 12, matching the TypeScript original
//! (`SALT_ROUNDS = 12`). The JWT signing/verification from `auth.ts` lives
//! in [`crate::jwt`] instead.

use bcrypt::{DEFAULT_COST, hash, verify};

/// bcrypt cost factor, matching `SALT_ROUNDS = 12` in `src/lib/auth.ts`.
pub const SALT_ROUNDS: u32 = 12;

/// Hash a plaintext password using bcrypt (cost 12).
pub fn hash_password(password: &str) -> Result<String, bcrypt::BcryptError> {
    hash(password, SALT_ROUNDS)
}

/// Compare a plaintext password against a bcrypt hash.
pub fn verify_password(password: &str, hash: &str) -> Result<bool, bcrypt::BcryptError> {
    verify(password, hash)
}

/// Default bcrypt cost constant re-exported for callers that need it directly.
pub const DEFAULT_BCRYPT_COST: u32 = DEFAULT_COST as u32;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hash_and_verify_roundtrip() {
        let hash = hash_password("correct-horse-battery-staple").expect("hashing should succeed");
        assert!(!hash.is_empty());
        // bcrypt hashes are non-deterministic, so just verify the hash works.
        assert!(verify_password("correct-horse-battery-staple", &hash)
            .expect("verification should succeed"));
    }

    #[test]
    fn verify_rejects_wrong_password() {
        let hash = hash_password("correct-horse-battery-staple").expect("hashing should succeed");
        assert!(!verify_password("wrong-password", &hash).expect("verification should succeed"));
    }

    #[test]
    fn hash_is_non_deterministic() {
        let h1 = hash_password("same-password").expect("hashing should succeed");
        let h2 = hash_password("same-password").expect("hashing should succeed");
        assert_ne!(h1, h2, "bcrypt hashes should include a random salt");
    }

    #[test]
    fn salt_rounds_matches_typescript() {
        assert_eq!(SALT_ROUNDS, 12);
    }

    #[test]
    fn default_cost_is_reasonable() {
        assert!(DEFAULT_BCRYPT_COST >= 4);
        assert!(DEFAULT_BCRYPT_COST <= 31);
    }
}
