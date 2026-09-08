// Shared password-strength scoring, used by both the registration form
// (src/app/login/page.tsx, for the live strength meter) and the server-side
// registerSchema in validations.ts. Keeping this in one place means the
// client's "too weak" gate and the API's actual enforcement can't drift
// apart - a password the UI accepts is guaranteed to also pass the schema,
// and someone posting straight to /api/auth/register without going through
// the UI can't bypass the complexity requirement the form advertises.

export interface PasswordCheck {
  label: string;
  passed: boolean;
}

export interface PasswordStrength {
  score: number;
  label: string;
  color: string;
  checks: PasswordCheck[];
}

// 5 checks below means score can be 0-5 inclusive (6 possible values) -
// these arrays need 6 entries, not 5. The original inline version of this
// function only had 5 labels/colors, so a password passing every check
// (score 5) indexed past the end and got label/color `undefined`.
const STRENGTH_LABELS = ["Very weak", "Weak", "Fair", "Good", "Strong", "Very strong"];
const STRENGTH_COLORS = [
  "bg-red-500",
  "bg-orange-500",
  "bg-yellow-500",
  "bg-lime-500",
  "bg-emerald-500",
  "bg-emerald-600",
];

/** Minimum score (out of 5 checks below) required to register. Matches the
 * gate the login form already enforced client-side before this file existed. */
export const MIN_PASSWORD_SCORE = 3;

export function getPasswordStrength(password: string): PasswordStrength {
  const checks: PasswordCheck[] = [
    { label: "8+ characters", passed: password.length >= 8 },
    { label: "Uppercase letter", passed: /[A-Z]/.test(password) },
    { label: "Lowercase letter", passed: /[a-z]/.test(password) },
    { label: "Number", passed: /\d/.test(password) },
    { label: "Special character", passed: /[^A-Za-z0-9]/.test(password) },
  ];
  const score = checks.filter((c) => c.passed).length;
  return {
    score,
    label: STRENGTH_LABELS[score],
    color: STRENGTH_COLORS[score],
    checks,
  };
}
