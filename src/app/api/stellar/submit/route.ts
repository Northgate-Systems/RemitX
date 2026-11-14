import { NextRequest } from "next/server";
import { data } from "@/lib/data";
import { getCurrentUser } from "@/lib/auth";
import { submitTransaction, NETWORK_PASSPHRASE } from "@/lib/stellar";
import { assertSignedXdrMatches, TxMismatchError } from "@/lib/tx-guard";
import { stellarSubmitSchema } from "@/lib/validations";
import { successResponse, errorResponse, unauthorizedResponse } from "@/lib/api-response";

// API routes must not pre-render
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return unauthorizedResponse();
    }

    const body = await request.json();
    const parsed = stellarSubmitSchema.safeParse(body);

    if (!parsed.success) {
      return errorResponse(parsed.error.issues[0]?.message ?? "Invalid submission", 400);
    }

    const { signedXdr, transactionId } = parsed.data;

    // Verify the transaction belongs to this user
    const existing = await data.transactions.findById(transactionId);
    if (!existing) {
      return errorResponse("Transaction not found", 404);
    }
    if (existing.userId !== user.id) {
      return unauthorizedResponse();
    }
    if (existing.status !== "pending") {
      return errorResponse(`Transaction is already in status: ${existing.status}`, 400);
    }

    try {
      assertSignedXdrMatches(signedXdr, {
        source: user.stellarPublicKey ?? "",
        recipient: existing.recipientAddress,
        fromAmount: existing.fromAmount,
        fromAsset: existing.fromAsset,
        toAsset: existing.toAsset,
        destMin: existing.destMin ?? undefined,
        unsignedTxHash: existing.unsignedTxHash ?? undefined,
        networkPassphrase: NETWORK_PASSPHRASE,
      });
    } catch (err) {
      if (err instanceof TxMismatchError) return errorResponse(err.message, 400);
      throw err;
    }

    await data.transactions.update(transactionId, { status: "validating" });

    const result = await submitTransaction(signedXdr);

    const updated = await data.transactions.update(transactionId, {
      status: result.status === "confirmed" ? "confirmed" : "failed",
      stellarTxHash: result.hash || null,
      confirmedAt: result.status === "confirmed" ? new Date().toISOString() : null,
    });

    if (!updated) {
      return errorResponse("Failed to update transaction status", 500);
    }

    return successResponse({
      transactionId: updated.id,
      status: updated.status,
      stellarTxHash: updated.stellarTxHash,
      resultCode: result.resultCode,
    });
  } catch (err) {
    console.error("Submit error:", err);
    return errorResponse("Internal server error", 500);
  }
}
