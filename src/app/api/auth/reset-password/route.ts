import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";
import { hashPassword } from "@/lib/auth";
import { successResponse, errorResponse } from "@/lib/api-response";
import {
  validateResetToken,
  rateLimit,
  logSecurityEvent,
  readBodyWithLimit,
} from "@/lib/security";

export async function POST(request: NextRequest) {
  try {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const rl = rateLimit(`reset-password:${ip}`, 5, 60_000);
    if (!rl.allowed) {
      logSecurityEvent("rate_limited", { ip, endpoint: "reset-password" });
      return errorResponse("Too many attempts. Please try again later.", 429);
    }

    const body = (await readBodyWithLimit(request)) as Record<string, unknown>;
    const { token, newPassword } = body as { token?: string; newPassword?: string };

    if (!token || !newPassword || newPassword.length < 8) {
      return errorResponse("Invalid token or password must be at least 8 characters", 400);
    }

    // Validate the reset token (checks expiry + signature)
    const resetData = validateResetToken(token);
    if (!resetData) {
      logSecurityEvent("password_reset_complete", { reason: "invalid_or_expired_token" });
      return errorResponse("Reset link is invalid or has expired. Please request a new one.", 400);
    }

    // Hash the new password
    const passwordHash = await hashPassword(newPassword);

    // Update password and increment session version to invalidate all existing sessions
    const { data: user, error } = await supabase
      .from("users")
      .update({
        passwordHash,
        sessionVersion: 1, // Reset to 1 - all old sessions invalidated
        failedLoginAttempts: 0,
        lockedUntil: null,
      })
      .eq("id", resetData.userId)
      .select("id")
      .single();

    if (error || !user) {
      console.error("Password reset update error:", error);
      return errorResponse("Failed to reset password", 500);
    }

    logSecurityEvent("password_reset_complete", { userId: resetData.userId });

    return successResponse({
      message: "Password reset successfully. Please sign in with your new password.",
    });
  } catch (err) {
    console.error("Reset password error:", err);
    return errorResponse("Internal server error", 500);
  }
}