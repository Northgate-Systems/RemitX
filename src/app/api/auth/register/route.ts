import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";
import { hashPassword, signToken, setSessionCookie, toSafeUser } from "@/lib/auth";
import { registerSchema } from "@/lib/validations";
import { verifyTurnstileToken } from "@/lib/turnstile";
import { successResponse, errorResponse } from "@/lib/api-response";
import type { User } from "@/lib/types";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = registerSchema.safeParse(body);

    if (!parsed.success) {
      return errorResponse(parsed.error.errors[0].message, 400);
    }

    const { firstName, lastName, email, password, turnstileToken } = parsed.data;

    const turnstile = await verifyTurnstileToken(turnstileToken);
    if (!turnstile.success) {
      return errorResponse(`Verification failed: ${turnstile.reason}`, 400);
    }

    // Check if user already exists
    const { data: existing } = await supabase
      .from("users")
      .select("id")
      .eq("email", email)
      .maybeSingle();
    if (existing) {
      return errorResponse("Email already registered", 409);
    }

    const passwordHash = await hashPassword(password);

    // Generate Stellar account
    let stellarPublicKey: string | null = null;
    try {
      const { createTestnetAccount } = await import("@/lib/stellar");
      const account = await createTestnetAccount();
      stellarPublicKey = account.publicKey;
      // TODO(product): In production, return the secret key to the user once for safekeeping.
      // Do NOT store it server-side. For testnet Dev UX we log it.
      console.log(`[DEV] New user ${email} Stellar secret: ${account.secretKey}`);
    } catch (err) {
      console.warn("Stellar account creation failed, continuing without one:", err);
    }

    const { data: user, error } = await supabase
      .from("users")
      .insert({
        firstName,
        lastName,
        email,
        passwordHash,
        stellarPublicKey,
        // kycStatus defaults to "pending"
      })
      .select("*")
      .single();

    if (error || !user) {
      console.error("Registration insert error:", error);
      return errorResponse("Internal server error", 500);
    }

    const safeUser = toSafeUser(user as User);
    const token = signToken(safeUser);
    await setSessionCookie(token);

    return successResponse({ user: safeUser }, 201);
  } catch (err) {
    console.error("Registration error:", err);
    return errorResponse("Internal server error", 500);
  }
}
