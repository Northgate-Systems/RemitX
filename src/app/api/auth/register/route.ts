import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";
import { hashPassword, signToken, setSessionCookie, toSafeUser } from "@/lib/auth";
import { registerSchema } from "@/lib/validations";
import { verifyTurnstileToken } from "@/lib/turnstile";
import { successResponse, errorResponse } from "@/lib/api-response";
import type { User } from "@/lib/types";
import {
  rateLimit,
  sanitizeInput,
  sanitizeEmail,
  logSecurityEvent,
  readBodyWithLimit,
} from "@/lib/security";

export async function POST(request: NextRequest) {
  try {
    // Rate limit by IP
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const rl = rateLimit(`register:${ip}`, 5, 60_000);
    if (!rl.allowed) {
      logSecurityEvent("rate_limited", { ip, endpoint: "register" });
      return errorResponse("Too many registration attempts. Please try again later.", 429);
    }

    const body = (await readBodyWithLimit(request)) as Record<string, unknown>;
    const parsed = registerSchema.safeParse(body);

    if (!parsed.success) {
      return errorResponse(parsed.error.errors[0].message, 400);
    }

    const { firstName, lastName, email, password, turnstileToken } = parsed.data;

    // Sanitize inputs before storing
    const cleanFirstName = sanitizeInput(firstName, 50);
    const cleanLastName = sanitizeInput(lastName, 50);
    const cleanEmail = sanitizeEmail(email);

    const turnstile = await verifyTurnstileToken(turnstileToken);
    if (!turnstile.success) {
      return errorResponse(`Verification failed: ${turnstile.reason}`, 400);
    }

    // Check if user already exists
    const { data: existing } = await supabase
      .from("users")
      .select("id")
      .eq("email", cleanEmail)
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
      console.log(`[DEV] New user ${cleanEmail} Stellar secret: ${account.secretKey}`);
    } catch (err) {
      console.warn("Stellar account creation failed, continuing without one:", err);
    }

    const { data: user, error } = await supabase
      .from("users")
      .insert({
        firstName: cleanFirstName,
        lastName: cleanLastName,
        email: cleanEmail,
        passwordHash,
        stellarPublicKey,
        sessionVersion: 1,
        failedLoginAttempts: 0,
        lockedUntil: null,
        // kycStatus defaults to "pending"
      })
      .select("*")
      .single();

    if (error || !user) {
      console.error("Registration insert error:", error);
      return errorResponse("Internal server error", 500);
    }

    logSecurityEvent("register", { userId: (user as User).id });

    const safeUser = toSafeUser(user as User);
    const token = signToken(safeUser, 1);
    await setSessionCookie(token);

    return successResponse({ user: safeUser }, 201);
  } catch (err) {
    console.error("Registration error:", err);
    return errorResponse("Internal server error", 500);
  }
}