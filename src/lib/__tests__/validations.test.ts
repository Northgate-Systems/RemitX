import { describe, it, expect } from "vitest";
import {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  signAndSubmitSchema,
  analyticsSchema,
  stellarSendSchema,
  stellarSubmitSchema,
  rateQuerySchema,
  transactionIdSchema,
} from "@/lib/validations";

const VALID_REGISTER = {
  firstName: "Bohdan",
  lastName: "Melnyk",
  email: "bohdan@example.com",
  password: "supersecret1",
  confirmPassword: "supersecret1",
  turnstileToken: "tok",
};

describe("registerSchema", () => {
  it("accepts a well-formed registration", () => {
    expect(registerSchema.safeParse(VALID_REGISTER).success).toBe(true);
  });

  it("rejects a whitespace-only first/last name", () => {
    // .trim() runs before .min(1), so " " alone must not slip through as
    // a non-empty name.
    const result = registerSchema.safeParse({ ...VALID_REGISTER, firstName: "   " });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid email address", () => {
    const result = registerSchema.safeParse({ ...VALID_REGISTER, email: "not-an-email" });
    expect(result.success).toBe(false);
  });

  it("rejects a password shorter than 8 characters", () => {
    const result = registerSchema.safeParse({
      ...VALID_REGISTER,
      password: "short1",
      confirmPassword: "short1",
    });
    expect(result.success).toBe(false);
  });

  it("rejects mismatched password/confirmPassword and attaches the error to confirmPassword", () => {
    const result = registerSchema.safeParse({
      ...VALID_REGISTER,
      confirmPassword: "somethingElse1",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toEqual(["confirmPassword"]);
      expect(result.error.issues[0].message).toBe("Passwords do not match");
    }
  });

  it("rejects a missing turnstileToken", () => {
    const result = registerSchema.safeParse({ ...VALID_REGISTER, turnstileToken: "" });
    expect(result.success).toBe(false);
  });

  it("rejects a first/last name over 50 characters", () => {
    const result = registerSchema.safeParse({ ...VALID_REGISTER, firstName: "a".repeat(51) });
    expect(result.success).toBe(false);
  });
});

describe("loginSchema", () => {
  it("accepts a well-formed login", () => {
    const result = loginSchema.safeParse({
      email: "bohdan@example.com",
      password: "anything",
      turnstileToken: "tok",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an invalid email", () => {
    expect(
      loginSchema.safeParse({ email: "nope", password: "x", turnstileToken: "tok" }).success
    ).toBe(false);
  });

  it("rejects an empty password (unlike registration, no minimum length here -- just non-empty)", () => {
    expect(
      loginSchema.safeParse({
        email: "bohdan@example.com",
        password: "",
        turnstileToken: "tok",
      }).success
    ).toBe(false);
  });

  it("rejects a missing turnstileToken", () => {
    expect(
      loginSchema.safeParse({ email: "bohdan@example.com", password: "x", turnstileToken: "" })
        .success
    ).toBe(false);
  });
});

describe("forgotPasswordSchema", () => {
  it("accepts a well-formed email", () => {
    expect(forgotPasswordSchema.safeParse({ email: "bohdan@example.com" }).success).toBe(true);
  });

  it("rejects an invalid email", () => {
    expect(forgotPasswordSchema.safeParse({ email: "not-an-email" }).success).toBe(false);
  });

  it("rejects a missing email", () => {
    expect(forgotPasswordSchema.safeParse({}).success).toBe(false);
  });
});

describe("resetPasswordSchema", () => {
  const VALID_RESET = { token: "reset-token-abc", newPassword: "supersecret1" };

  it("accepts a well-formed reset request", () => {
    expect(resetPasswordSchema.safeParse(VALID_RESET).success).toBe(true);
  });

  it("rejects a missing token", () => {
    expect(resetPasswordSchema.safeParse({ ...VALID_RESET, token: "" }).success).toBe(false);
  });

  it("rejects a password shorter than 8 characters", () => {
    expect(resetPasswordSchema.safeParse({ ...VALID_RESET, newPassword: "short1" }).success).toBe(
      false
    );
  });

  it("rejects a weak password the same way registerSchema would (previously reset-password only checked length)", () => {
    // 8+ chars but only lowercase letters - registerSchema has always
    // rejected this via the strength check; reset-password's old inline
    // `newPassword.length < 8` check did not.
    expect(
      resetPasswordSchema.safeParse({ ...VALID_RESET, newPassword: "aaaaaaaa" }).success
    ).toBe(false);
  });
});

describe("signAndSubmitSchema", () => {
  const VALID_SIGN_AND_SUBMIT = {
    transactionId: "tx-1",
    xdr: "AAAA...",
    secretKey: "SABC...",
  };

  it("accepts a well-formed request", () => {
    expect(signAndSubmitSchema.safeParse(VALID_SIGN_AND_SUBMIT).success).toBe(true);
  });

  it("rejects a missing transactionId", () => {
    expect(
      signAndSubmitSchema.safeParse({ ...VALID_SIGN_AND_SUBMIT, transactionId: "" }).success
    ).toBe(false);
  });

  it("rejects a missing xdr", () => {
    expect(signAndSubmitSchema.safeParse({ ...VALID_SIGN_AND_SUBMIT, xdr: "" }).success).toBe(
      false
    );
  });

  it("rejects a missing secretKey", () => {
    expect(
      signAndSubmitSchema.safeParse({ ...VALID_SIGN_AND_SUBMIT, secretKey: "" }).success
    ).toBe(false);
  });
});

describe("analyticsSchema", () => {
  it("accepts a fully-populated pageview", () => {
    expect(
      analyticsSchema.safeParse({ url: "/dashboard", referrer: "https://google.com", ts: 123 })
        .success
    ).toBe(true);
  });

  it("accepts an empty body - every field is optional", () => {
    expect(analyticsSchema.safeParse({}).success).toBe(true);
  });

  it("rejects a non-string url", () => {
    expect(analyticsSchema.safeParse({ url: 12345 }).success).toBe(false);
  });

  it("rejects a non-number ts", () => {
    expect(analyticsSchema.safeParse({ ts: "not-a-number" }).success).toBe(false);
  });

  it("rejects a url beyond the length cap", () => {
    expect(analyticsSchema.safeParse({ url: "a".repeat(2049) }).success).toBe(false);
  });
});

describe("stellarSendSchema", () => {
  const VALID_RECIPIENT = "G" + "A".repeat(55);

  it("accepts a well-formed send request", () => {
    const result = stellarSendSchema.safeParse({
      fromAsset: "USDC",
      toAsset: "XLM",
      amount: "12.34",
      recipientAddress: VALID_RECIPIENT,
    });
    expect(result.success).toBe(true);
  });

  it("accepts a whole-number amount with no decimal point", () => {
    expect(
      stellarSendSchema.safeParse({
        fromAsset: "USDC",
        toAsset: "XLM",
        amount: "100",
        recipientAddress: VALID_RECIPIENT,
      }).success
    ).toBe(true);
  });

  it("rejects a negative amount", () => {
    expect(
      stellarSendSchema.safeParse({
        fromAsset: "USDC",
        toAsset: "XLM",
        amount: "-5",
        recipientAddress: VALID_RECIPIENT,
      }).success
    ).toBe(false);
  });

  it("rejects a non-numeric amount", () => {
    expect(
      stellarSendSchema.safeParse({
        fromAsset: "USDC",
        toAsset: "XLM",
        amount: "abc",
        recipientAddress: VALID_RECIPIENT,
      }).success
    ).toBe(false);
  });

  it("rejects a recipient address that isn't a valid-shaped Stellar public key", () => {
    expect(
      stellarSendSchema.safeParse({
        fromAsset: "USDC",
        toAsset: "XLM",
        amount: "1",
        recipientAddress: "not-a-stellar-address",
      }).success
    ).toBe(false);
  });

  it("rejects a recipient address one character short of the required length", () => {
    expect(
      stellarSendSchema.safeParse({
        fromAsset: "USDC",
        toAsset: "XLM",
        amount: "1",
        recipientAddress: "G" + "A".repeat(54),
      }).success
    ).toBe(false);
  });

  it("rejects an empty fromAsset/toAsset", () => {
    expect(
      stellarSendSchema.safeParse({
        fromAsset: "",
        toAsset: "XLM",
        amount: "1",
        recipientAddress: VALID_RECIPIENT,
      }).success
    ).toBe(false);
  });
});

describe("stellarSubmitSchema", () => {
  it("accepts a well-formed submission", () => {
    expect(
      stellarSubmitSchema.safeParse({ signedXdr: "AAAA...", transactionId: "tx-1" }).success
    ).toBe(true);
  });

  it("rejects an empty signedXdr", () => {
    expect(
      stellarSubmitSchema.safeParse({ signedXdr: "", transactionId: "tx-1" }).success
    ).toBe(false);
  });

  it("rejects an empty transactionId", () => {
    expect(
      stellarSubmitSchema.safeParse({ signedXdr: "AAAA...", transactionId: "" }).success
    ).toBe(false);
  });
});

describe("rateQuerySchema", () => {
  it("accepts a well-formed rate query", () => {
    expect(rateQuerySchema.safeParse({ from: "USDC", to: "XLM" }).success).toBe(true);
  });

  it("rejects an empty asset code", () => {
    expect(rateQuerySchema.safeParse({ from: "", to: "XLM" }).success).toBe(false);
  });

  it("rejects an asset code over 10 characters", () => {
    expect(rateQuerySchema.safeParse({ from: "a".repeat(11), to: "XLM" }).success).toBe(false);
  });
});

describe("transactionIdSchema", () => {
  it("accepts a well-formed UUID", () => {
    expect(
      transactionIdSchema.safeParse({ id: "550e8400-e29b-41d4-a716-446655440000" }).success
    ).toBe(true);
  });

  it("rejects a non-UUID string, including a plausible-looking numeric id", () => {
    const result = transactionIdSchema.safeParse({ id: "12345" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("Invalid transaction ID");
    }
  });
});
