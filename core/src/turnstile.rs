//! Cloudflare Turnstile verification logic, ported from `src/lib/turnstile.ts`.
//!
//! The network call itself is left to the caller (this crate is I/O-free);
//! this module encapsulates the *decision* logic: secret configuration,
//! fail-closed in production, dev-mode bypass, and token presence.

/// Result of evaluating whether a Turnstile token should be verified.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum TurnstileDecision {
    /// Skip verification entirely (development, no secret configured).
    Skip,
    /// Proceed with verification (secret configured and token present).
    Verify,
    /// Reject — fail-closed (production without a configured secret).
    RejectConfigured,
    /// Reject — no token provided.
    RejectMissingToken,
}

impl TurnstileDecision {
    pub fn as_success_reason(&self) -> (bool, Option<&'static str>) {
        match self {
            TurnstileDecision::Skip => (true, None),
            TurnstileDecision::Verify => (true, None),
            TurnstileDecision::RejectConfigured => {
                (false, Some("Verification is not configured"))
            }
            TurnstileDecision::RejectMissingToken => {
                (false, Some("Missing verification token"))
            }
        }
    }
}

/// Decide how to handle a Turnstile token, mirroring the TypeScript original:
///
/// - No secret configured + production → fail-closed reject.
/// - No secret configured + non-production → skip (dev bypass).
///   secret configured + no token → reject missing token.
///   secret configured + token present → proceed to verify.
pub fn decide(secret: Option<&str>, token: Option<&str>, is_production: bool) -> TurnstileDecision {
    let Some(secret) = secret else {
        if is_production {
            return TurnstileDecision::RejectConfigured;
        }
        return TurnstileDecision::Skip;
    };

    if secret.is_empty() {
        if is_production {
            return TurnstileDecision::RejectConfigured;
        }
        return TurnstileDecision::Skip;
    }

    let Some(token) = token else {
        return TurnstileDecision::RejectMissingToken;
    };

    if token.is_empty() {
        return TurnstileDecision::RejectMissingToken;
    }

    TurnstileDecision::Verify
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn production_no_secret_rejects_configured() {
        assert_eq!(
            decide(None, Some("token"), true),
            TurnstileDecision::RejectConfigured
        );
    }

    #[test]
    fn production_empty_secret_rejects_configured() {
        assert_eq!(
            decide(Some(""), Some("token"), true),
            TurnstileDecision::RejectConfigured
        );
    }

    #[test]
    fn development_no_secret_skips() {
        assert_eq!(
            decide(None, Some("token"), false),
            TurnstileDecision::Skip
        );
    }

    #[test]
    fn development_empty_secret_skips() {
        assert_eq!(
            decide(Some(""), Some("token"), false),
            TurnstileDecision::Skip
        );
    }

    #[test]
    fn no_token_rejects_missing() {
        assert_eq!(
            decide(Some("secret-key"), None, false),
            TurnstileDecision::RejectMissingToken
        );
    }

    #[test]
    fn empty_token_rejects_missing() {
        assert_eq!(
            decide(Some("secret-key"), Some(""), false),
            TurnstileDecision::RejectMissingToken
        );
    }

    #[test]
    fn secret_and_token_proceeds_to_verify() {
        assert_eq!(
            decide(Some("secret-key"), Some("token"), false),
            TurnstileDecision::Verify
        );
    }

    #[test]
    fn secret_and_token_proceeds_in_production() {
        assert_eq!(
            decide(Some("secret-key"), Some("token"), true),
            TurnstileDecision::Verify
        );
    }

    #[test]
    fn skip_reports_success() {
        let (ok, reason) = TurnstileDecision::Skip.as_success_reason();
        assert!(ok);
        assert!(reason.is_none());
    }

    #[test]
    fn reject_configured_reports_failure() {
        let (ok, reason) = TurnstileDecision::RejectConfigured.as_success_reason();
        assert!(!ok);
        assert_eq!(reason, Some("Verification is not configured"));
    }

    #[test]
    fn reject_missing_token_reports_failure() {
        let (ok, reason) = TurnstileDecision::RejectMissingToken.as_success_reason();
        assert!(!ok);
        assert_eq!(reason, Some("Missing verification token"));
    }

    #[test]
    fn verify_reports_success() {
        let (ok, reason) = TurnstileDecision::Verify.as_success_reason();
        assert!(ok);
        assert!(reason.is_none());
    }
}
