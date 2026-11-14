import { NextRequest } from "next/server";
import { data } from "@/lib/data";
import { signToken, setSessionCookie, toSafeUser } from "@/lib/auth";
import { setDemoCookie } from "@/lib/demo-mode";
import { successResponse, errorResponse } from "@/lib/api-response";
import { rateLimit, logSecurityEvent } from "@/lib/security";

export const dynamic = "force-dynamic";

const DEMO_EMAIL = "alice@remitx.dev";

export function isDemoLoginEnabled(): boolean {
  return (
    process.env.NODE_ENV !== "production" &&
    process.env.ENABLE_DEMO_LOGIN === "true"
  );
}

export async function performDemoLogin(request: NextRequest): Promise<Response> {
  if (!isDemoLoginEnabled()) {
    return errorResponse("Not found", 404);
  }

  try {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const rl = rateLimit(`demo-login:${ip}`, 20, 60_000);
    if (!rl.allowed) {
      logSecurityEvent("rate_limited", { ip, endpoint: "demo-login" });
      return errorResponse("Too many attempts. Please try again later.", 429);
    }

    let user = await data.users.findByEmail(DEMO_EMAIL);
    if (!user) {
      // Seed a demo user on demand without a hardcoded password.
      user = await data.users.create({
        firstName: "Alice",
        lastName: "Johnson",
        email: DEMO_EMAIL,
        passwordHash: "",
        stellarPublicKey: null,
        kycStatus: "verified",
        sessionVersion: 1,
        failedLoginAttempts: 0,
        lockedUntil: null,
      });
    }

    logSecurityEvent("login_success", { userId: user.id, demo: true });

    const safeUser = toSafeUser(user);
    const token = signToken(safeUser, user.sessionVersion || 1);
    await setSessionCookie(token);

    // Mark the request as demo so the UI can switch to demo mode and the
    // API can serve demo data for the rest of the session.
    const response = successResponse({ user: safeUser });
    return setDemoCookie(response);
  } catch (err) {
    console.error("Demo login error:", err);
    return errorResponse("Internal server error", 500);
  }
}
