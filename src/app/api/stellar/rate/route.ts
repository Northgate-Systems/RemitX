import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getRate } from "@/lib/rates";
import { rateQuerySchema } from "@/lib/validations";
import { successResponse, errorResponse } from "@/lib/api-response";

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return errorResponse("Unauthorized", 401);
    }

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
    console.error("Rate fetch error:", err);
    return errorResponse("Failed to fetch exchange rate", 500);
  }
}
