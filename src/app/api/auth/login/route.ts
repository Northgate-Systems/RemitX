import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { verifyPassword, signToken, setSessionCookie, toSafeUser } from "@/lib/auth";
import { loginSchema } from "@/lib/validations";
import { verifyTurnstileToken } from "@/lib/turnstile";
import { successResponse, errorResponse } from "@/lib/api-response";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = loginSchema.safeParse(body);

    if (!parsed.success) {
      return errorResponse(parsed.error.errors[0].message, 400);
    }

    const { email, password, turnstileToken } = parsed.data;

    const turnstile = await verifyTurnstileToken(turnstileToken);
    if (!turnstile.success) {
      return errorResponse(`Verification failed: ${turnstile.reason}`, 400);
    }

    const user = await db.user.findUnique({ where: { email } });
    if (!user) {
      return errorResponse("Invalid email or password", 401);
    }

    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      return errorResponse("Invalid email or password", 401);
    }

    const safeUser = toSafeUser(user);
    const token = signToken(safeUser);
    await setSessionCookie(token);

    return successResponse({ user: safeUser });
  } catch (err) {
    console.error("Login error:", err);
    return errorResponse("Internal server error", 500);
  }
}