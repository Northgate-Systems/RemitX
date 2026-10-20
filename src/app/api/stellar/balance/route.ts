import { getCurrentUser } from "@/lib/auth";
import { getAccountBalances } from "@/lib/stellar";
import { successResponse, errorResponse, unauthorizedResponse } from "@/lib/api-response";

// See note in src/app/api/health/route.ts — API routes must not pre-render.
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return unauthorizedResponse();
    }

    if (!user.stellarPublicKey) {
      return successResponse({ activated: false, balances: [] });
    }

    const balances = await getAccountBalances(user.stellarPublicKey);
    return successResponse({ activated: true, balances });
  } catch (err) {
    console.error("Balance fetch error:", err);
    return errorResponse("Failed to fetch account balance", 500);
  }
}
