import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { successResponse, unauthorizedResponse } from "@/lib/api-response";

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return unauthorizedResponse();
    }

    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 100);
    const offset = parseInt(searchParams.get("offset") || "0");

    const [transactions, total] = await Promise.all([
      db.transaction.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      }),
      db.transaction.count({
        where: { userId: user.id },
      }),
    ]);

    return successResponse({
      transactions,
      total,
      limit,
      offset,
    });
  } catch (err) {
    console.error("Transactions fetch error:", err);
    return unauthorizedResponse();
  }
}