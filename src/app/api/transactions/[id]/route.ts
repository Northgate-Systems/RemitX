import { supabase } from "@/lib/supabase";
import { getCurrentUser } from "@/lib/auth";
import { successResponse, errorResponse, unauthorizedResponse } from "@/lib/api-response";
import type { Transaction } from "@/lib/types";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return unauthorizedResponse();

  const { id } = await params;

  const { data: tx, error: txError } = await supabase
    .from("transactions")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (txError || !tx) return errorResponse("Transaction not found", 404);
  if ((tx as Transaction).userId !== user.id) return unauthorizedResponse();

  const { data: escrow } = await supabase
    .from("escrows")
    .select("*")
    .eq("transactionId", (tx as Transaction).id)
    .maybeSingle();

  return successResponse({ transaction: tx, escrow: escrow || null });
}
