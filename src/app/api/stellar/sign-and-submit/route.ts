import { NextRequest } from "next/server";
import { Keypair, TransactionBuilder } from "@stellar/stellar-sdk";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { submitTransaction, NETWORK_PASSPHRASE } from "@/lib/stellar";
import { successResponse, errorResponse, unauthorizedResponse } from "@/lib/api-response";

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

    const tx = await db.transaction.findUnique({ where: { id: transactionId } });
    if (!tx) return errorResponse("Transaction not found", 404);
    if (tx.userId !== user.id) return unauthorizedResponse();
    if (tx.status !== "pending") {
      return errorResponse(`Transaction is already in status: ${tx.status}`, 400);
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

    await db.transaction.update({ where: { id: transactionId }, data: { status: "validating" } });

    const result = await submitTransaction(transaction.toXDR());

    const updated = await db.transaction.update({
      where: { id: transactionId },
      data: {
        status: result.status === "confirmed" ? "confirmed" : "failed",
        stellarTxHash: result.hash || null,
        confirmedAt: result.status === "confirmed" ? new Date() : null,
      },
    });

    return successResponse({
      transactionId: updated.id,
      status: updated.status,
      stellarTxHash: updated.stellarTxHash,
      resultCode: result.resultCode,
    });
  } catch (err: unknown) {
    console.error("Sign-and-submit error:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return errorResponse(message, 500);
  }
}
