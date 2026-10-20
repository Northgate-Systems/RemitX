import { getCurrentUser } from "@/lib/auth";
import { getNetworkStatus } from "@/lib/stellar";
import { successResponse, errorResponse, unauthorizedResponse } from "@/lib/api-response";

// See note in src/app/api/health/route.ts — API routes must not pre-render.
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return unauthorizedResponse();
    }

    const status = await getNetworkStatus();
    return successResponse(status);
  } catch (err) {
    console.error("Network status fetch error:", err);
    return errorResponse("Failed to fetch network status", 500);
  }
}
