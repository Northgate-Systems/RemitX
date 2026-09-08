import { describe, it, expect } from "vitest";
import { getPasswordStrength, MIN_PASSWORD_SCORE } from "@/lib/password-strength";
import { registerSchema } from "@/lib/validations";

describe("getPasswordStrength", () => {
  it("scores an empty password 0 and labels it Very weak", () => {
    const result = getPasswordStrength("");
    expect(result.score).toBe(0);
    expect(result.label).toBe("Very weak");
    expect(result.checks.every((c) => !c.passed)).toBe(true);
  });

  it("scores a password meeting all 5 checks as 5/Very strong", () => {
    const result = getPasswordStrength("Str0ng!Pass");
    expect(result.score).toBe(5);
    expect(result.label).toBe("Very strong");
    expect(result.checks.every((c) => c.passed)).toBe(true);
  });

  it("never returns an undefined label/color for any possible score (0-5)", () => {
    // Regression guard for the original off-by-one: 5 checks means scores
    // 0 through 5 (six values) are possible, but the label/color arrays
    // only had 5 entries, so a perfect password's score (5) indexed past
    // the end and got `undefined` for both.
    const passwordsByScore = ["", "a", "abc12345", "Abc12345", "Abc123!5", "Abc123!5Xy"];
    for (const pw of passwordsByScore) {
      const result = getPasswordStrength(pw);
      expect(result.label).toBeDefined();
      expect(result.color).toBeDefined();
    }
  });

  it("counts exactly which checks pass for a lowercase-and-digits-only password", () => {
    // 8+ chars + lowercase + number = 3, missing uppercase and special char.
    const result = getPasswordStrength("abcdef12");
    expect(result.score).toBe(3);
    const byLabel = Object.fromEntries(result.checks.map((c) => [c.label, c.passed]));
    expect(byLabel["8+ characters"]).toBe(true);
    expect(byLabel["Lowercase letter"]).toBe(true);
    expect(byLabel["Number"]).toBe(true);
    expect(byLabel["Uppercase letter"]).toBe(false);
    expect(byLabel["Special character"]).toBe(false);
  });

  it("does not count length toward the 8+ characters check when under 8", () => {
    const result = getPasswordStrength("Ab1!");
    const byLabel = Object.fromEntries(result.checks.map((c) => [c.label, c.passed]));
    expect(byLabel["8+ characters"]).toBe(false);
    // the other 4 checks still pass independently of length
    expect(result.score).toBe(4);
  });

  it("MIN_PASSWORD_SCORE is 3 (matches the registration form's gate)", () => {
    expect(MIN_PASSWORD_SCORE).toBe(3);
  });
});

const VALID_REGISTER_BASE = {
  firstName: "Bohdan",
  lastName: "Melnyk",
  email: "bohdan@example.com",
  confirmPassword: "",
  turnstileToken: "tok",
};

function registerWith(password: string) {
  return registerSchema.safeParse({
    ...VALID_REGISTER_BASE,
    password,
    confirmPassword: password,
  });
}

describe("registerSchema password policy", () => {
  it("accepts a password scoring exactly the minimum (3/5)", () => {
    // 8+ chars + lowercase + number, no uppercase/special char.
    const result = registerWith("supersecret1");
    expect(result.success).toBe(true);
  });

  it("rejects a password that is long enough but too simple (score 2/5)", () => {
    // 8+ chars + lowercase only - no number, uppercase, or special char.
    const result = registerWith("onlylowercase");
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message);
      expect(messages.some((m) => /too weak/i.test(m))).toBe(true);
    }
  });

  it("rejects a short password on the length check before the strength refine runs", () => {
    const result = registerWith("Ab1!");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("Password must be at least 8 characters");
    }
  });

  it("rejects a password over 128 characters", () => {
    const result = registerWith("Aa1!" + "x".repeat(126));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => /at most 128/.test(i.message))).toBe(true);
    }
  });

  it("accepts a strong password with all 5 checks passing", () => {
    const result = registerWith("Str0ng!Passw0rd");
    expect(result.success).toBe(true);
  });
});
