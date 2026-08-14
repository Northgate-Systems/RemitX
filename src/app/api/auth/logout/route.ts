import { clearSessionCookie } from "@/lib/auth";
import { successResponse } from "@/lib/api-response";

export async function POST() {
  await clearSessionCookie();
  return successResponse({ message: "Logged out" });
}