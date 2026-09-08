import { getCurrentUser } from "@/lib/auth";
import { getFeeEstimate } from "@/lib/stellar";
import { successResponse, errorResponse, unauthorizedResponse } from "@/lib/api-response";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return unauthorizedResponse();
    }

    const estimate = await getFeeEstimate();
    return successResponse(estimate);
  } catch (err) {
    console.error("Fee estimate fetch error:", err);
    return errorResponse("Failed to fetch fee estimate", 500);
  }
}
