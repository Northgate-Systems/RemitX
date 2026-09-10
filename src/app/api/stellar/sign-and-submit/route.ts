import { NextRequest } from "next/server";
import { Keypair, TransactionBuilder } from "@stellar/stellar-sdk";
import { supabase } from "@/lib/supabase";
import { getCurrentUser } from "@/lib/auth";
import { submitTransaction, NETWORK_PASSPHRASE } from "@/lib/stellar";
import { successResponse, errorResponse, unauthorizedResponse } from "@/lib/api-response";
import {
  claimPendingTransaction,
  releasePendingClaim,
  finalizeTransaction,
} from "@/lib/transaction-state";
import type { Transaction } from "@/lib/types";

// ---------------------------------------------------------------------------
// Testnet-only convenience endpoint: signs server-side with a secret key
// supplied in the request body, so the demo works without a browser wallet
// extension (e.g. Freighter). The secret key is used in-memory for this
// request only and is never stored or logged.
//
// Do NOT use this pattern on mainnet or with real funds - swap in a browser
// wallet extension for signing before going to production.
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return unauthorizedResponse();
    }

    const body = await request.json();
    const { transactionId, xdr, secretKey } = body as {
      transactionId?: string;
      xdr?: string;
      secretKey?: string;
    };

    if (!transactionId || !xdr || !secretKey) {
      return errorResponse("transactionId, xdr, and secretKey are all required", 400);
    }

    const { data: tx, error: txError } = await supabase
      .from("transactions")
      .select("*")
      .eq("id", transactionId)
      .maybeSingle();

    if (txError || !tx) return errorResponse("Transaction not found", 404);
    const existing = tx as Transaction;
    if (existing.userId !== user.id) return unauthorizedResponse();
    if (existing.status !== "pending") {
      return errorResponse(`Transaction is already in status: ${existing.status}`, 400);
    }

    let keypair: Keypair;
    try {
      keypair = Keypair.fromSecret(secretKey);
    } catch {
      return errorResponse("That doesn't look like a valid Stellar secret key.", 400);
    }
    if (keypair.publicKey() !== user.stellarPublicKey) {
      return errorResponse("This secret key doesn't match your account's public key.", 400);
    }

    const transaction = TransactionBuilder.fromXDR(xdr, NETWORK_PASSPHRASE);
    transaction.sign(keypair);

    // Same compare-and-set as /api/stellar/submit: the status check above is
    // a separate round trip from this write, so only a conditional update can
    // stop two concurrent requests for the same transactionId from both
    // broadcasting the payment.
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
      result = await submitTransaction(transaction.toXDR());
    } catch (submitErr) {
      // Nothing reached the network, so release the claim instead of leaving
      // the row stuck in "validating", where the guard above would reject
      // every future retry of a payment that was never submitted.
      await releasePendingClaim(transactionId);
      throw submitErr;
    }

    const finalTx = await finalizeTransaction(transactionId, {
      status: result.status === "confirmed" ? "confirmed" : "failed",
      stellarTxHash: result.hash || null,
    });

    if (!finalTx) {
      // Deliberately not rolled back: the transaction was already broadcast,
      // so re-submitting it would risk paying twice.
      console.error("Sign-and-submit update error: could not record final status", {
        transactionId,
        stellarTxHash: result.hash,
        status: result.status,
      });
      return errorResponse("Failed to update transaction status", 500);
    }

    return successResponse({
      transactionId: finalTx.id,
      status: finalTx.status,
      stellarTxHash: finalTx.stellarTxHash,
      resultCode: result.resultCode,
    });
  } catch (err: unknown) {
    console.error("Sign-and-submit error:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return errorResponse(message, 500);
  }
}
