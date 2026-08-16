import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";
import { verifyPassword, signToken, setSessionCookie, toSafeUser } from "@/lib/auth";
import { loginSchema } from "@/lib/validations";
import { verifyTurnstileToken } from "@/lib/turnstile";
import { successResponse, errorResponse } from "@/lib/api-response";
import type { User } from "@/lib/types";
import {
  rateLimit,
  checkAccountLockout,
  recordFailedLogin,
  resetLoginAttempts,
  sanitizeEmail,
  logSecurityEvent,
  readBodyWithLimit,
} from "@/lib/security";

export async function POST(request: NextRequest) {
  try {
    // Rate limit by IP
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const rl = rateLimit(`login:${ip}`, 10, 60_000);
    if (!rl.allowed) {
      logSecurityEvent("rate_limited", { ip, endpoint: "login" });
      return errorResponse("Too many attempts. Please try again later.", 429);
    }

    const body = (await readBodyWithLimit(request)) as Record<string, unknown>;
    const parsed = loginSchema.safeParse(body);

    if (!parsed.success) {
      return errorResponse(parsed.error.errors[0].message, 400);
    }

    const { email, password, turnstileToken } = parsed.data;
    const normalizedEmail = sanitizeEmail(email);

    // Check account lockout
    const lockout = checkAccountLockout(normalizedEmail);
    if (lockout.locked) {
      logSecurityEvent("login_locked", { email: normalizedEmail });
      return errorResponse(
        `Account temporarily locked. Try again in ${Math.ceil(lockout.retryAfterMs / 60000)} minutes.`,
        429
      );
    }

    const turnstile = await verifyTurnstileToken(turnstileToken);
    if (!turnstile.success) {
      return errorResponse(`Verification failed: ${turnstile.reason}`, 400);
    }

    const { data: user, error } = await supabase
      .from("users")
      .select("*")
      .eq("email", normalizedEmail)
      .maybeSingle();

    // Prevent user enumeration - same error for user not found and wrong password
    if (error || !user) {
      recordFailedLogin(normalizedEmail);
      logSecurityEvent("login_failed", { email: normalizedEmail, reason: "user_not_found" });
      return errorResponse("Invalid email or password", 401);
    }

    const valid = await verifyPassword(password, (user as User).passwordHash);
    if (!valid) {
      recordFailedLogin(normalizedEmail);
      logSecurityEvent("login_failed", { email: normalizedEmail, reason: "wrong_password" });
      return errorResponse("Invalid email or password", 401);
    }

    // Check if account is locked in DB (column may not exist on old schema)
    const userRow = user as User;
    const lockedUntil = (userRow as Record<string, unknown>).lockedUntil as string | null | undefined;
    if (lockedUntil && new Date(lockedUntil) > new Date()) {
      return errorResponse("Account temporarily locked. Try again later.", 429);
    }

    // Success - reset attempts and log
    resetLoginAttempts(normalizedEmail);
    logSecurityEvent("login_success", { userId: userRow.id });

    const safeUser = toSafeUser(userRow);
    const sessionVersion = (userRow as Record<string, unknown>).sessionVersion as number | undefined;
    const token = signToken(safeUser, sessionVersion || 1);
    await setSessionCookie(token);

    return successResponse({ user: safeUser });
  } catch (err) {
    console.error("Login error:", err);
    const message = err instanceof Error ? err.message : "";
    if (message.includes("SUPABASE_SERVICE_ROLE_KEY") || message.includes("NEXT_PUBLIC_SUPABASE_URL")) {
      return errorResponse("Database not configured. Add SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SUPABASE_URL to your .env file.", 500);
    }
    return errorResponse("Internal server error", 500);
  }
}
