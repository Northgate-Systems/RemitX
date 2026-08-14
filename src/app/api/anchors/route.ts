import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { listAnchors, estimateFee } from "@/lib/anchors";
import { successResponse, unauthorizedResponse } from "@/lib/api-response";

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return unauthorizedResponse();

  const { searchParams } = new URL(request.url);
  const corridor = searchParams.get("corridor") || undefined;
  const assetCode = searchParams.get("assetCode") || undefined;
  const amount = parseFloat(searchParams.get("amount") || "1000");

  const anchors = listAnchors({ corridor, assetCode }).map((a) => ({
    ...a,
    estimatedFee: estimateFee(a, amount),
  }));

  return successResponse({ anchors, amount });
}
