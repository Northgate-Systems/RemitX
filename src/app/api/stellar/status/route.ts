import { getCurrentUser } from "@/lib/auth";
import { getNetworkStatus } from "@/lib/stellar";
import { successResponse, errorResponse, unauthorizedResponse } from "@/lib/api-response";
import { logger } from "@/lib/logger";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return unauthorizedResponse();
    }

    const status = await getNetworkStatus();
    return successResponse(status);
  } catch (err) {
    logger.error("stellar_status.fetch_error", { err });
    return errorResponse("Failed to fetch network status", 500);
  }
}
