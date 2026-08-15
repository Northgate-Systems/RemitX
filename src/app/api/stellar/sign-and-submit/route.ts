import { NextRequest } from "next/server";
import { Keypair, TransactionBuilder } from "@stellar/stellar-sdk";
import { supabase } from "@/lib/supabase";
import { getCurrentUser } from "@/lib/auth";
import { submitTransaction, NETWORK_PASSPHRASE } from "@/lib/stellar";
import { successResponse, errorResponse, unauthorizedResponse } from "@/lib/api-response";
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

    await supabase
      .from("transactions")
      .update({ status: "validating" })
      .eq("id", transactionId);

    const result = await submitTransaction(transaction.toXDR());

    const { data: updated, error: updateError } = await supabase
      .from("transactions")
      .update({
        status: result.status === "confirmed" ? "confirmed" : "failed",
        stellarTxHash: result.hash || null,
        confirmedAt: result.status === "confirmed" ? new Date().toISOString() : null,
      })
      .eq("id", transactionId)
      .select("*")
      .single();

    if (updateError || !updated) {
      console.error("Sign-and-submit update error:", updateError);
      return errorResponse("Failed to update transaction status", 500);
    }

    const finalTx = updated as Transaction;
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
