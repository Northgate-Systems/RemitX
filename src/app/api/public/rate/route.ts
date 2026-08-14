import { NextRequest } from "next/server";
import { getRate } from "@/lib/rates";
import { rateQuerySchema } from "@/lib/validations";
import { successResponse, errorResponse } from "@/lib/api-response";

/**
 * Public, unauthenticated rate lookup - same market data as
 * /api/stellar/rate, just without requiring a session. Used by the landing
 * page so visitors see real live rates before signing in. Read-only, no
 * user-specific data, so it's safe to expose without auth.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const parsed = rateQuerySchema.safeParse({
      from: searchParams.get("from"),
      to: searchParams.get("to"),
    });

    if (!parsed.success) {
      return errorResponse("Invalid query parameters. Required: from, to", 400);
    }

    const { from, to } = parsed.data;
    const result = await getRate(from.toUpperCase(), to.toUpperCase());

    return successResponse({
      rate: result.rate,
      fromAsset: result.fromAsset,
      toAsset: result.toAsset,
      fetchedAt: result.fetchedAt,
      source: result.source,
    });
  } catch (err) {
    console.error("Public rate fetch error:", err);
    return errorResponse("Failed to fetch exchange rate", 500);
  }
}
