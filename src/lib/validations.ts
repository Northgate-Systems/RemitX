import { z } from "zod";
import { getPasswordStrength, MIN_PASSWORD_SCORE } from "@/lib/password-strength";

// Shared by registerSchema and resetPasswordSchema so both paths into a
// password enforce the same strength rule - resetPasswordSchema previously
// only checked length inline, which meant a password reset could set a
// weaker password than registration would ever have allowed.
const strongPasswordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(128, "Password must be at most 128 characters")
  .refine((pw) => getPasswordStrength(pw).score >= MIN_PASSWORD_SCORE, {
    message:
      "Password is too weak - mix in uppercase, lowercase, numbers, and symbols (at least 3 of those 5 checks must pass)",
  });

export const registerSchema = z
  .object({
    firstName: z.string().trim().min(1, "First name is required").max(50),
    lastName: z.string().trim().min(1, "Last name is required").max(50),
    email: z.string().email("Invalid email address"),
    password: strongPasswordSchema,
    confirmPassword: z.string().min(1, "Please confirm your password"),
    turnstileToken: z.string().min(1, "Please complete the verification challenge"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
  turnstileToken: z.string().min(1, "Please complete the verification challenge"),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email("Invalid email address"),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1, "Reset token is required"),
  newPassword: strongPasswordSchema,
});

export const signAndSubmitSchema = z.object({
  transactionId: z.string().min(1, "Transaction ID is required"),
  xdr: z.string().min(1, "Signed XDR is required"),
  secretKey: z.string().min(1, "Secret key is required"),
});

export const analyticsSchema = z.object({
  url: z.string().max(2048).optional(),
  referrer: z.string().max(2048).optional(),
  ts: z.number().optional(),
});

export const stellarSendSchema = z.object({
  fromAsset: z.string().min(1, "Source asset is required").max(10),
  toAsset: z.string().min(1, "Destination asset is required").max(10),
  amount: z.string().regex(/^\d+(\.\d+)?$/, "Amount must be a positive number"),
  // The regex alone accepts any 56-char G-string, so a single mistyped
  // character sails through it; the checksum is what actually catches typos.
  recipientAddress: z
    .string()
    .regex(/^G[A-Z2-7]{55}$/, "Invalid Stellar public key")
    .refine(isValidStellarPublicKey, "Invalid Stellar public key (checksum failed)"),
});

export const stellarSubmitSchema = z.object({
  signedXdr: z.string().min(1, "Signed XDR is required"),
  transactionId: z.string().min(1, "Transaction ID is required"),
});

export const rateQuerySchema = z.object({
  from: z.string().min(1).max(10),
  to: z.string().min(1).max(10),
});

export const transactionIdSchema = z.object({
  id: z.string().uuid("Invalid transaction ID"),
});