import { z } from "zod";
import { StrKey } from "@stellar/stellar-sdk";

// ---------------------------------------------------------------------------
// Stellar-specific primitives
//
// A Stellar public key is base32 over a version byte + 32-byte key + a 2-byte
// CRC16 checksum. A shape-only regex (`G` + 55 base32 chars) therefore accepts
// typo'd keys: flipping a single character keeps the shape valid but breaks the
// checksum. The SDK only rejects those later, while building the operation -
// which happens after the Horizon round-trip in buildSendTransaction() - so a
// mistyped recipient surfaced as a generic 500 instead of a 400. Check the
// checksum here, before anything touches the network.
// ---------------------------------------------------------------------------

const STELLAR_PUBKEY_SHAPE = /^G[A-Z2-7]{55}$/;

/** True only for a well-formed Stellar public key with a valid checksum. */
export function isStellarPublicKey(value: string): boolean {
  return STELLAR_PUBKEY_SHAPE.test(value) && StrKey.isValidEd25519PublicKey(value);
}

export const stellarPublicKeySchema = z
  .string()
  .regex(STELLAR_PUBKEY_SHAPE, "Invalid Stellar public key")
  .refine((value) => StrKey.isValidEd25519PublicKey(value), {
    message: "Invalid Stellar public key: checksum does not match (check for typos)",
  });

/** Stellar amounts are fixed-point with 7 decimal places; more precision than
 * that is rejected by the SDK when the operation is built. */
export const stellarAmountSchema = z
  .string()
  .regex(/^\d+(\.\d+)?$/, "Amount must be a positive number")
  .refine((value) => (value.split(".")[1]?.length ?? 0) <= 7, {
    message: "Amount cannot have more than 7 decimal places",
  })
  .refine((value) => parseFloat(value) > 0, {
    message: "Amount must be greater than zero",
  });

export const registerSchema = z
  .object({
    firstName: z.string().trim().min(1, "First name is required").max(50),
    lastName: z.string().trim().min(1, "Last name is required").max(50),
    email: z.string().email("Invalid email address"),
    password: z.string().min(8, "Password must be at least 8 characters"),
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

export const stellarSendSchema = z.object({
  fromAsset: z.string().min(1, "Source asset is required").max(10),
  toAsset: z.string().min(1, "Destination asset is required").max(10),
  amount: stellarAmountSchema,
  recipientAddress: stellarPublicKeySchema,
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