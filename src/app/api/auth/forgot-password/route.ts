import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";
import { successResponse, errorResponse } from "@/lib/api-response";
import { generateResetToken, rateLimit, sanitizeEmail, logSecurityEvent } from "@/lib/security";

export async function POST(request: NextRequest) {
  try {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const rl = rateLimit(`forgot-password:${ip}`, 3, 60_000);
    if (!rl.allowed) {
      logSecurityEvent("rate_limited", { ip, endpoint: "forgot-password" });
      return errorResponse("Too many requests. Please try again later.", 429);
    }

    const body = await request.json();
    const email = sanitizeEmail(body.email || "");

    if (!email || !email.includes("@")) {
      return errorResponse("Invalid email address", 400);
    }

    // Always return success to prevent user enumeration
    // Even if the email doesn't exist, we return the same response
    const { data: user } = await supabase
      .from("users")
      .select("id")
      .eq("email", email)
      .maybeSingle();

    if (user) {
      const { token, expiresAt } = generateResetToken(user.id);
      logSecurityEvent("password_reset_request", { userId: user.id });

      // In production, send email with reset link:
      // https://remitx.app/reset-password?token=...
      // For dev, log the token (testnet-only)
      console.log(`[DEV] Password reset token for ${email}: ${token} (expires ${new Date(expiresAt).toISOString()})`);
    }

    // Always return the same response to prevent user enumeration
    return successResponse({
      message: "If an account exists with that email, a reset link has been sent.",
    });
  } catch (err) {
    console.error("Forgot password error:", err);
    return errorResponse("Internal server error", 500);
  }
}