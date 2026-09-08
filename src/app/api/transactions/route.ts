import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";
import { getCurrentUser } from "@/lib/auth";
import { successResponse, errorResponse, unauthorizedResponse } from "@/lib/api-response";

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
      // A failed query (DB down, bad connection, etc.) is a server-side
      // problem, not an auth problem - returning 401 here used to tell
      // clients "your session expired" when the real story was "the
      // database call failed", which is a misleading signal to build any
      // client-side logout/redirect behavior on top of.
      console.error("Transactions fetch error:", error);
      return errorResponse("Failed to fetch transactions", 500);
    }

    return successResponse({
      transactions: transactions || [],
      total: count ?? 0,
      limit,
      offset,
    });
  } catch (err) {
    console.error("Transactions fetch error:", err);
    return errorResponse("Failed to fetch transactions", 500);
  }
}
