import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";
import { getCurrentUser } from "@/lib/auth";
import { successResponse, unauthorizedResponse } from "@/lib/api-response";
import { logger } from "@/lib/logger";

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return unauthorizedResponse();
    }

    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 100);
    const offset = parseInt(searchParams.get("offset") || "0");

    const { data: transactions, error, count } = await supabase
      .from("transactions")
      .select("*", { count: "exact" })
      .eq("userId", user.id)
      .order("createdAt", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      logger.error("transactions.fetch_error", { err: error });
      return unauthorizedResponse();
    }

    return successResponse({
      transactions: transactions || [],
      total: count ?? 0,
      limit,
      offset,
    });
  } catch (err) {
    logger.error("transactions.fetch_error", { err });
    return unauthorizedResponse();
  }
}
