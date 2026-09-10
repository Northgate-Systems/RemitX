import { z } from "zod";
import { getPasswordStrength, MIN_PASSWORD_SCORE } from "@/lib/password-strength";

export const registerSchema = z
  .object({
    firstName: z.string().trim().min(1, "First name is required").max(50),
    lastName: z.string().trim().min(1, "Last name is required").max(50),
    email: z.string().email("Invalid email address"),
    password: z
      .string()
      .min(8, "Password must be at least 8 characters")
      .max(128, "Password must be at most 128 characters")
      .refine((pw) => getPasswordStrength(pw).score >= MIN_PASSWORD_SCORE, {
        message:
          "Password is too weak - mix in uppercase, lowercase, numbers, and symbols (at least 3 of those 5 checks must pass)",
      }),
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

// Query params for GET /api/transactions - all optional, all validated up
// front so the route can build one Supabase query without inline checks.
export const transactionQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(50),
    offset: z.coerce.number().int().min(0).default(0),
    status: z.enum(["pending", "validating", "confirmed", "failed"]).optional(),
    // Plain date or full ISO datetime - both parse fine via `new Date(...)`
    // in the route; the regex just rejects garbage before it gets there.
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}/, "from must be an ISO date").optional(),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}/, "to must be an ISO date").optional(),
    // fromAmount is intentionally excluded: it's stored as a string to avoid
    // float precision loss (see schema.prisma), so a DB-level ORDER BY on it
    // would sort lexicographically ("10" before "9") instead of numerically -
    // that's a worse result than no sort option at all.
    sortBy: z.enum(["createdAt", "confirmedAt"]).default("createdAt"),
    sortOrder: z.enum(["asc", "desc"]).default("desc"),
  })
  .refine(
    (data) => !data.from || !data.to || new Date(data.from) <= new Date(data.to),
    { message: "from must be before or equal to to", path: ["from"] }
  );