import { z } from "zod";

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
  amount: z.string().regex(/^\d+(\.\d+)?$/, "Amount must be a positive number"),
  recipientAddress: z.string().regex(/^G[A-Z2-7]{55}$/, "Invalid Stellar public key"),
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