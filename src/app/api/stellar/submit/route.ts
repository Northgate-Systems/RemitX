import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { submitTransaction } from "@/lib/stellar";
import { stellarSubmitSchema } from "@/lib/validations";
import { successResponse, errorResponse, unauthorizedResponse } from "@/lib/api-response";

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
    const tx = await db.transaction.findUnique({ where: { id: transactionId } });
    if (!tx) {
      return errorResponse("Transaction not found", 404);
    }
    if (tx.userId !== user.id) {
      return unauthorizedResponse();
    }
    if (tx.status !== "pending") {
      return errorResponse(`Transaction is already in status: ${tx.status}`, 400);
    }

    // Status is set to "validating" while Horizon processes the signed
    // transaction; submitTransaction() below resolves it to confirmed/failed.
    await db.transaction.update({
      where: { id: transactionId },
      data: { status: "validating" },
    });

    const result = await submitTransaction(signedXdr);

    const updated = await db.transaction.update({
      where: { id: transactionId },
      data: {
        status: result.status === "confirmed" ? "confirmed" : "failed",
        stellarTxHash: result.hash,
        confirmedAt: result.status === "confirmed" ? new Date() : null,
      },
    });

    return successResponse({
      transactionId: updated.id,
      stellarTxHash: updated.stellarTxHash,
      status: updated.status,
      fromAsset: updated.fromAsset,
      toAsset: updated.toAsset,
      fromAmount: updated.fromAmount,
      toAmount: updated.toAmount,
    });
  } catch (err: unknown) {
    console.error("Submit error:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return errorResponse(message, 500);
  }
}