import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";
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

    const { data: transactions, error, count } = await supabase
      .from("transactions")
      .select("*", { count: "exact" })
      .eq("userId", user.id)
      .order("createdAt", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error("Transactions fetch error:", error);
      return unauthorizedResponse();
    }

    return successResponse({
      transactions: transactions || [],
      total: count ?? 0,
      limit,
      offset,
    });
  } catch (err) {
    console.error("Transactions fetch error:", err);
    return unauthorizedResponse();
  }
}
