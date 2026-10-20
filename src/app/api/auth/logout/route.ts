import { clearSessionCookie, getCurrentUser } from "@/lib/auth";
import { successResponse } from "@/lib/api-response";
import { logSecurityEvent } from "@/lib/security";

// See note in src/app/api/health/route.ts — API routes must not pre-render.
export const dynamic = "force-dynamic";

export async function POST() {
  const user = await getCurrentUser();
  if (user) {
    logSecurityEvent("logout", { userId: user.id });
  }
  await clearSessionCookie();
  return successResponse({ message: "Logged out" });
}