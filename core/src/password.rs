//! Password-strength scoring.
//!
//! Ported directly from `src/lib/password-strength.ts`. This is shared by the
//! registration form (live strength meter) and the server-side register schema,
//! so the client's "too weak" gate and the API's enforcement can't drift apart.

use serde::{Deserialize, Serialize};

/// A single requirement shown in the strength meter.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PasswordCheck {
    pub label: String,
    pub passed: bool,
}

/// The full result of scoring a password.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PasswordStrength {
    pub score: u8,
    pub label: String,
    pub color: String,
    pub checks: Vec<PasswordCheck>,
}

/// Minimum score (out of the 5 checks below) required to register. Matches the
/// gate the login form already enforced client-side.
pub const MIN_PASSWORD_SCORE: u8 = 3;

// 5 checks below means score can be 0-5 inclusive (6 possible values) — these
// arrays need 6 entries, not 5, so a password passing every check (score 5)
// still resolves to a label/color instead of indexing past the end.
const STRENGTH_LABELS: [&str; 6] = [
    "Very weak",
    "Weak",
    "Fair",
    "Good",
    "Strong",
    "Very strong",
];
const STRENGTH_COLORS: [&str; 6] = [
    "bg-red-500",
    "bg-orange-500",
    "bg-yellow-500",
    "bg-lime-500",
    "bg-emerald-500",
    "bg-emerald-600",
];

fn has_uppercase(pw: &str) -> bool {
    pw.chars().any(|c| c.is_ascii_uppercase())
}

fn has_lowercase(pw: &str) -> bool {
    pw.chars().any(|c| c.is_ascii_lowercase())
}

fn has_digit(pw: &str) -> bool {
    pw.chars().any(|c| c.is_ascii_digit())
}

/// "Special character" = anything that isn't an ASCII letter or digit.
fn has_special(pw: &str) -> bool {
    pw.chars().any(|c| !c.is_ascii_alphanumeric())
}

/// Score a password on 5 independent requirements and return the label/color
/// plus the individual checks (for rendering the meter).
pub fn get_password_strength(password: &str) -> PasswordStrength {
    let checks = vec![
        PasswordCheck {
            label: "8+ characters".to_string(),
            passed: password.chars().count() >= 8,
        },
        PasswordCheck {
            label: "Uppercase letter".to_string(),
            passed: has_uppercase(password),
        },
        PasswordCheck {
            label: "Lowercase letter".to_string(),
            passed: has_lowercase(password),
        },
        PasswordCheck {
            label: "Number".to_string(),
            passed: has_digit(password),
        },
        PasswordCheck {
            label: "Special character".to_string(),
            passed: has_special(password),
        },
    ];

    let score = checks.iter().filter(|c| c.passed).count() as u8;
    // score is always 0..=5 by construction, so this index is always in range.
    let index = score as usize;

    PasswordStrength {
        score,
        label: STRENGTH_LABELS[index].to_string(),
        color: STRENGTH_COLORS[index].to_string(),
        checks,
    }
}

/// Convenience boolean: does this password meet the registration bar?
pub fn meets_password_requirement(password: &str) -> bool {
    get_password_strength(password).score >= MIN_PASSWORD_SCORE
}

#[cfg(feature = "wasm")]
mod wasm {
    use super::*;
    use wasm_bindgen::prelude::*;

    /// `getPasswordStrength(password)` — returns the strength as JSON so the
    /// browser meter renders the same checks the API enforces.
    #[wasm_bindgen(js_name = getPasswordStrength)]
    pub fn get_password_strength_js(password: &str) -> String {
        serde_json::to_string(&get_password_strength(password))
            .unwrap_or_else(|_| "{}".to_string())
    }

    /// `meetsPasswordRequirement(password) -> bool`
    #[wasm_bindgen(js_name = meetsPasswordRequirement)]
    pub fn meets_password_requirement_js(password: &str) -> bool {
        meets_password_requirement(password)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_password_is_zero_and_very_weak() {
        let s = get_password_strength("");
        assert_eq!(s.score, 0);
        assert_eq!(s.label, "Very weak");
        assert_eq!(s.checks.len(), 5);
        assert!(s.checks.iter().all(|c| !c.passed));
    }

    #[test]
    fn score_matches_passed_check_count() {
        // lowercase + digits only = 3 checks (8+ chars, lowercase, number)
        let s = get_password_strength("abcdef123");
        assert_eq!(s.score, 3);
        assert_eq!(s.label, "Good");
        assert!(!s.checks[1].passed); // no uppercase
        assert!(!s.checks[4].passed); // no special
    }

    #[test]
    fn full_strength_scores_five_with_correct_label() {
        // Regression: the original TS indexed a 5-element array with score 5.
        let s = get_password_strength("Aa1!aaaa");
        assert_eq!(s.score, 5);
        assert_eq!(s.label, "Very strong");
        assert_eq!(s.color, "bg-emerald-600");
        assert!(s.checks.iter().all(|c| c.passed));
    }

    #[test]
    fn minimum_acceptable_password_passes_gate() {
        // 3 checks: lowercase, uppercase, digit (no special) → score 3 == MIN
        assert!(meets_password_requirement("Abcdefg1"));
        // 2 checks → below the bar
        assert!(!meets_password_requirement("abcdefgh"));
    }

    #[test]
    fn non_ascii_letters_do_not_count_as_ascii_case() {
        // 'É' is uppercase but not ASCII; the check is ascii-only like the TS.
        let s = get_password_strength("ÉÉÉÉÉ123");
        assert!(!s.checks[1].passed); // no ascii uppercase
        assert!(s.checks[0].passed); // 8+ chars
        assert!(s.checks[3].passed); // number
    }

    #[test]
    fn every_score_index_has_a_label() {
        for pw in ["", "a", "Aa", "Aa1", "Aa1!", "Aa1!aaa"] {
            let s = get_password_strength(pw);
            assert!(!s.label.is_empty());
            assert!(!s.color.is_empty());
        }
    }
}
