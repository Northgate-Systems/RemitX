import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getLiquidityPool } from "@/lib/stellar";
import { successResponse, errorResponse, unauthorizedResponse } from "@/lib/api-response";

// getLiquidityPool() already caches per-asset for 60s (see
// LIQUIDITY_CACHE_TTL_MS in src/lib/stellar.ts), so the browser/CDN layer
// here matches that window. `private` (not `public`) - this route requires
// a session, so a shared/CDN cache must never serve one user's response to
// a different, unauthenticated request.
const LIQUIDITY_CACHE_CONTROL = "private, max-age=60, stale-while-revalidate=120";

/** Real Horizon liquidity pool reserves for a given asset code (top pool by
 * reserve size). Returns null data if the asset has no configured issuer or
 * no pool exists - never a fabricated figure. */
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      const response = unauthorizedResponse();
      response.headers.set("Cache-Control", "no-store");
      return response;
    }

    const { searchParams } = new URL(request.url);
    const assetCode = searchParams.get("asset");
    if (!assetCode) {
      const response = errorResponse("asset query parameter is required", 400);
      response.headers.set("Cache-Control", "no-store");
      return response;
    }

    const { result } = await getLiquidityPool(assetCode);

    const response = successResponse(result);
    response.headers.set("Cache-Control", LIQUIDITY_CACHE_CONTROL);
    return response;
  } catch (err: unknown) {
    console.error("Liquidity fetch error:", err);
    const response = errorResponse(err instanceof Error ? err.message : "Failed to fetch liquidity", 500);
    response.headers.set("Cache-Control", "no-store");
    return response;
  }
}
