import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getRate } from "@/lib/rates";
import { rateQuerySchema } from "@/lib/validations";
import { successResponse, errorResponse } from "@/lib/api-response";

// src/lib/rates.ts already refreshes its own in-memory cache every 5
// minutes (CACHE_TTL_MS), so an HTTP cache longer than that would risk
// serving a rate the origin has already moved past. 30s matches what #374
// asked for while comfortably staying under that ceiling;
// stale-while-revalidate covers the gap while a fresh fetch is in flight.
//
// `private` (not `public` like the sibling /api/public/rate got in #405) -
// this route requires a session, so a shared/CDN cache must never be
// allowed to serve one user's response to a different, unauthenticated
// request. The rate value itself isn't user-specific, but the endpoint is
// behind auth, and that's what "private" is protecting here.
const RATE_CACHE_CONTROL = "private, max-age=30, stale-while-revalidate=60";

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      const response = errorResponse("Unauthorized", 401);
      response.headers.set("Cache-Control", "no-store");
      return response;
    }

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
    // Don't let a degraded (hardcoded-fallback) rate sit in the browser
    // cache for a full 30s once live rates recover.
    response.headers.set(
      "Cache-Control",
      result.source === "fallback" ? "no-store" : RATE_CACHE_CONTROL
    );
    return response;
  } catch (err) {
    console.error("Rate fetch error:", err);
    const response = errorResponse("Failed to fetch exchange rate", 500);
    response.headers.set("Cache-Control", "no-store");
    return response;
  }
}
