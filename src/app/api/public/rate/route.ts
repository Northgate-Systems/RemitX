import { NextRequest } from "next/server";
import { getRate } from "@/lib/rates";
import { rateQuerySchema } from "@/lib/validations";
import { successResponse, errorResponse } from "@/lib/api-response";

// The rate lib itself refreshes its in-memory cache every 5 minutes
// (CACHE_TTL_MS in src/lib/rates.ts), so an edge/browser cache longer than
// that would risk serving a rate the origin has already moved past. 60s
// keeps this well under that ceiling while still letting a CDN absorb most
// of the landing-page traffic; stale-while-revalidate covers the gap while
// a fresh fetch is in flight.
const RATE_CACHE_CONTROL = "public, max-age=60, s-maxage=60, stale-while-revalidate=240";

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
      const response = errorResponse("Invalid query parameters. Required: from, to", 400);
      response.headers.set("Cache-Control", "no-store");
      return response;
    }

    const { from, to } = parsed.data;
    const result = await getRate(from.toUpperCase(), to.toUpperCase());

    const response = successResponse({
      rate: result.rate,
      fromAsset: result.fromAsset,
      toAsset: result.toAsset,
      fetchedAt: result.fetchedAt,
      source: result.source,
    });
    // Don't let a CDN/browser cache a degraded rate (hardcoded fallback or
    // the last-resort "1.00") for a full minute once live rates recover.
    response.headers.set(
      "Cache-Control",
      result.source === "fallback" ? "no-store" : RATE_CACHE_CONTROL
    );
    return response;
  } catch (err) {
    console.error("Public rate fetch error:", err);
    const response = errorResponse("Failed to fetch exchange rate", 500);
    response.headers.set("Cache-Control", "no-store");
    return response;
  }
}
