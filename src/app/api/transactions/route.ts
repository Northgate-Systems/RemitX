import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";
import { getCurrentUser } from "@/lib/auth";
import { transactionQuerySchema } from "@/lib/validations";
import { successResponse, errorResponse, unauthorizedResponse } from "@/lib/api-response";

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return unauthorizedResponse();
    }

    const { searchParams } = new URL(request.url);
    const parsed = transactionQuerySchema.safeParse({
      limit: searchParams.get("limit") ?? undefined,
      offset: searchParams.get("offset") ?? undefined,
      status: searchParams.get("status") ?? undefined,
      from: searchParams.get("from") ?? undefined,
      to: searchParams.get("to") ?? undefined,
      sortBy: searchParams.get("sortBy") ?? undefined,
      sortOrder: searchParams.get("sortOrder") ?? undefined,
    });

    if (!parsed.success) {
      return errorResponse(parsed.error.errors[0].message, 400);
    }

    const { limit, offset, status, from, to, sortBy, sortOrder } = parsed.data;

    let query = supabase
      .from("transactions")
      .select("*", { count: "exact" })
      .eq("userId", user.id);

    if (status) {
      query = query.eq("status", status);
    }
    if (from) {
      query = query.gte("createdAt", new Date(from).toISOString());
    }
    if (to) {
      // Treat a plain date "to" as end-of-day so `to=2026-09-10` includes
      // that whole day, not just its first millisecond.
      const toDate = new Date(to);
      if (/^\d{4}-\d{2}-\d{2}$/.test(to)) {
        toDate.setUTCHours(23, 59, 59, 999);
      }
      query = query.lte("createdAt", toDate.toISOString());
    }

    const { data: transactions, error, count } = await query
      .order(sortBy, { ascending: sortOrder === "asc" })
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
