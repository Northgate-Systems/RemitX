import { clearSessionCookie, getCurrentUser } from "@/lib/auth";
import { successResponse } from "@/lib/api-response";
import { logSecurityEvent } from "@/lib/security";

export async function POST() {
  const user = await getCurrentUser();
  if (user) {
    logSecurityEvent("logout", { userId: user.id });
  }
  await clearSessionCookie();
  return successResponse({ message: "Logged out" });
}