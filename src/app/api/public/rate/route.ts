import { NextRequest } from "next/server";
import { getRate } from "@/lib/rates";
import { rateQuerySchema } from "@/lib/validations";
import { successResponse, errorResponse } from "@/lib/api-response";
import { withPublicCors, publicCorsPreflight } from "@/lib/cors";

/**
 * Public, unauthenticated rate lookup - same market data as
 * /api/stellar/rate, just without requiring a session. Used by the landing
 * page so visitors see real live rates before signing in. Read-only, no
 * user-specific data, so it's safe to expose without auth.
 *
 * CORS: this route explicitly opts into an open, read-only CORS policy
 * (see src/lib/cors.ts) so third-party pages/widgets can call it directly
 * instead of silently depending on whatever the framework/browser default
 * happens to be.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const parsed = rateQuerySchema.safeParse({
      from: searchParams.get("from"),
      to: searchParams.get("to"),
    });

    if (!parsed.success) {
      return withPublicCors(errorResponse("Invalid query parameters. Required: from, to", 400));
    }

    const { from, to } = parsed.data;
    const result = await getRate(from.toUpperCase(), to.toUpperCase());

    return withPublicCors(
      successResponse({
        rate: result.rate,
        fromAsset: result.fromAsset,
        toAsset: result.toAsset,
        fetchedAt: result.fetchedAt,
        source: result.source,
      })
    );
  } catch (err) {
    console.error("Public rate fetch error:", err);
    return withPublicCors(errorResponse("Failed to fetch exchange rate", 500));
  }
}

export function OPTIONS() {
  return publicCorsPreflight();
}
