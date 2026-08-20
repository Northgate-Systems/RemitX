import { supabase } from "@/lib/supabase";
import { getCurrentUser } from "@/lib/auth";
import { successResponse, errorResponse, unauthorizedResponse } from "@/lib/api-response";
import { transactionIdSchema } from "@/lib/validations";
import type { Transaction } from "@/lib/types";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return unauthorizedResponse();

  const parsed = transactionIdSchema.safeParse(await params);
  if (!parsed.success) {
    return errorResponse("Invalid transaction ID", 400);
  }

  const { id } = parsed.data;

  const { data: tx, error: txError } = await supabase
    .from("transactions")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (txError || !tx) return errorResponse("Transaction not found", 404);

  if ((tx as Transaction).userId !== user.id) {
    return errorResponse("Transaction not found", 404);
  }

  const { data: escrow } = await supabase
    .from("escrows")
    .select("*")
    .eq("transactionId", (tx as Transaction).id)
    .maybeSingle();

  return successResponse({ transaction: tx, escrow: escrow || null });
}
