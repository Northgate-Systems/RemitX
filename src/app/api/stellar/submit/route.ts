import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";
import { getCurrentUser } from "@/lib/auth";
import { submitTransaction } from "@/lib/stellar";
import { stellarSubmitSchema } from "@/lib/validations";
import { successResponse, errorResponse, unauthorizedResponse } from "@/lib/api-response";
import type { Transaction } from "@/lib/types";

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return unauthorizedResponse();
    }

    const body = await request.json();
    const parsed = stellarSubmitSchema.safeParse(body);

    if (!parsed.success) {
      return errorResponse(parsed.error.errors[0].message, 400);
    }

    const { signedXdr, transactionId } = parsed.data;

    // Verify the transaction belongs to this user
    const { data: tx, error: txError } = await supabase
      .from("transactions")
      .select("*")
      .eq("id", transactionId)
      .maybeSingle();

    if (txError || !tx) {
      return errorResponse("Transaction not found", 404);
    }
    const existing = tx as Transaction;
    if (existing.userId !== user.id) {
      return unauthorizedResponse();
    }
    if (existing.status !== "pending") {
      return errorResponse(`Transaction is already in status: ${existing.status}`, 400);
    }

    // Status is set to "validating" while Horizon processes the signed
    // transaction; submitTransaction() below resolves it to confirmed/failed.
    await supabase
      .from("transactions")
      .update({ status: "validating" })
      .eq("id", transactionId);

    const result = await submitTransaction(signedXdr);

    const { data: updated, error: updateError } = await supabase
      .from("transactions")
      .update({
        status: result.status === "confirmed" ? "confirmed" : "failed",
        stellarTxHash: result.hash,
        confirmedAt: result.status === "confirmed" ? new Date().toISOString() : null,
      })
      .eq("id", transactionId)
      .select("*")
      .single();

    if (updateError || !updated) {
      console.error("Submit update error:", updateError);
      return errorResponse("Failed to update transaction status", 500);
    }

    const finalTx = updated as Transaction;
    return successResponse({
      transactionId: finalTx.id,
      stellarTxHash: finalTx.stellarTxHash,
      status: finalTx.status,
      fromAsset: finalTx.fromAsset,
      toAsset: finalTx.toAsset,
      fromAmount: finalTx.fromAmount,
      toAmount: finalTx.toAmount,
    });
  } catch (err: unknown) {
    console.error("Submit error:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return errorResponse(message, 500);
  }
}
