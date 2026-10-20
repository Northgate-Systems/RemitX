import { getCurrentUser } from "@/lib/auth";
import { successResponse, unauthorizedResponse } from "@/lib/api-response";

// See note in src/app/api/health/route.ts — API routes must not pre-render.
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return unauthorizedResponse();
  }
  return successResponse({ user });
}