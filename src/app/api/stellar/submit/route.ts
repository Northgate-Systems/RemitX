import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";
import { getCurrentUser } from "@/lib/auth";
import { submitTransaction } from "@/lib/stellar";
import { stellarSubmitSchema } from "@/lib/validations";
import { successResponse, errorResponse, unauthorizedResponse } from "@/lib/api-response";
import {
  claimPendingTransaction,
  releasePendingClaim,
  finalizeTransaction,
} from "@/lib/transaction-state";
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

    // Claim the transaction: flip pending -> validating, but only if it is
    // still pending at the moment of the write. The status check above is a
    // separate round trip, so without this compare-and-set two concurrent
    // requests for the same transactionId would both get past it and both
    // broadcast the payment to Horizon.
    const claim = await claimPendingTransaction(transactionId);
    if (!claim.claimed) {
      if (claim.reason === "not_found") {
        return errorResponse("Transaction not found", 404);
      }
      return errorResponse(
        `Transaction is already in status: ${claim.status}`,
        409
      );
    }

    let result;
    try {
      result = await submitTransaction(signedXdr);
    } catch (submitErr) {
      // Nothing was broadcast (or we never learned that it was), so the row
      // must not be left stuck in "validating" - that state is rejected by
      // the guard above and would make this transaction permanently
      // un-submittable. Put it back to pending so the user can retry.
      await releasePendingClaim(transactionId);
      throw submitErr;
    }

    const finalTx = await finalizeTransaction(transactionId, {
      status: result.status === "confirmed" ? "confirmed" : "failed",
      stellarTxHash: result.hash,
    });

    if (!finalTx) {
      // The broadcast already happened, so the row is deliberately NOT rolled
      // back to pending here - retrying would risk a double submission. It
      // stays in "validating" and the recorded Horizon hash below lets the
      // state be reconciled.
      console.error("Submit update error: could not record final status", {
        transactionId,
        stellarTxHash: result.hash,
        status: result.status,
      });
      return errorResponse("Failed to update transaction status", 500);
    }

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
