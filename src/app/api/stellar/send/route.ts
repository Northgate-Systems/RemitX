import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { buildSendTransaction, fetchRate } from "@/lib/stellar";
import { stellarSendSchema } from "@/lib/validations";
import { successResponse, errorResponse, unauthorizedResponse } from "@/lib/api-response";

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return unauthorizedResponse();
    }

    if (!user.stellarPublicKey) {
      return errorResponse("User has no Stellar account. Create one via /api/stellar/account first.", 400);
    }

    const body = await request.json();
    const parsed = stellarSendSchema.safeParse(body);

    if (!parsed.success) {
      return errorResponse(parsed.error.errors[0].message, 400);
    }

    const { fromAsset, toAsset, amount, recipientAddress } = parsed.data;

    // Validate amount > 0
    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      return errorResponse("Amount must be a positive number", 400);
    }

    const rate = await fetchRate(fromAsset.toUpperCase(), toAsset.toUpperCase());
    const toAmount = (amountNum * parseFloat(rate)).toFixed(2);
    const xdr = await buildSendTransaction({
      sourcePublicKey: user.stellarPublicKey,
      fromAsset: fromAsset.toUpperCase(),
      toAsset: toAsset.toUpperCase(),
      fromAmount: amount,
      toAmount,
      recipientAddress,
    });

    const transaction = await db.transaction.create({
      data: {
        userId: user.id,
        fromAsset: fromAsset.toUpperCase(),
        toAsset: toAsset.toUpperCase(),
        fromAmount: amount,
        toAmount,
        recipientAddress,
        status: "pending",
      },
    });

    return successResponse({
      transactionId: transaction.id,
      xdr,
      fromAsset: fromAsset.toUpperCase(),
      toAsset: toAsset.toUpperCase(),
      fromAmount: amount,
      toAmount,
      recipientAddress,
    }, 201);
  } catch (err: unknown) {
    console.error("Send error:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    if (message.includes("Invalid recipient")) {
      return errorResponse(message, 400);
    }
    return errorResponse(message || "Failed to build transaction", 500);
  }
}