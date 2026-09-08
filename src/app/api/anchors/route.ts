import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { listAnchors, estimateFee } from "@/lib/anchors";
import { paginationQuerySchema } from "@/lib/validations";
import { successResponse, errorResponse, unauthorizedResponse } from "@/lib/api-response";

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return unauthorizedResponse();

  const { searchParams } = new URL(request.url);
  const corridor = searchParams.get("corridor") || undefined;
  const assetCode = searchParams.get("assetCode") || undefined;
  const amount = parseFloat(searchParams.get("amount") || "1000");

  const paginationParsed = paginationQuerySchema.safeParse({
    page: searchParams.get("page") ?? undefined,
    pageSize: searchParams.get("pageSize") ?? undefined,
  });
  if (!paginationParsed.success) {
    return errorResponse(paginationParsed.error.issues[0]?.message ?? "Invalid pagination parameters", 400);
  }
  const { page, pageSize } = paginationParsed.data;

  // Filter/estimate over the full matching set first so `total`/`totalPages`
  // reflect the whole directory for these filters, not just the page slice.
  const allMatching = listAnchors({ corridor, assetCode }).map((a) => ({
    ...a,
    estimatedFee: estimateFee(a, amount),
  }));

  const total = allMatching.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const start = (page - 1) * pageSize;
  const anchors = allMatching.slice(start, start + pageSize);

  return successResponse({
    anchors,
    amount,
    pagination: { page, pageSize, total, totalPages },
  });
}
