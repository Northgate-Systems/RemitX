import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";
import { getCurrentUser } from "@/lib/auth";
import { buildSendTransaction, fetchRate } from "@/lib/stellar";
import { stellarSendSchema } from "@/lib/validations";
import { successResponse, errorResponse, unauthorizedResponse } from "@/lib/api-response";
import {
  rateLimit,
  sanitizeInput,
  detectPromptInjection,
  logSecurityEvent,
  readBodyWithLimit,
} from "@/lib/security";

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return unauthorizedResponse();
    }

    if (!user.stellarPublicKey) {
      return errorResponse("User has no Stellar account. Create one via /api/stellar/account first.", 400);
    }

    // Rate limit per user
    const rl = rateLimit(`send:${user.id}`, 20, 60_000);
    if (!rl.allowed) {
      logSecurityEvent("rate_limited", { userId: user.id, endpoint: "stellar/send" });
      return errorResponse("Too many send requests. Please try again later.", 429);
    }

    const body = (await readBodyWithLimit(request)) as Record<string, unknown>;
    const parsed = stellarSendSchema.safeParse(body);

    if (!parsed.success) {
      return errorResponse(parsed.error.errors[0].message, 400);
    }

    const { fromAsset, toAsset, amount, recipientAddress } = parsed.data;

    // Sanitize inputs
    const cleanRecipient = sanitizeInput(recipientAddress, 56);

    // Prompt injection detection on free-text fields
    if (detectPromptInjection(cleanRecipient)) {
      logSecurityEvent("prompt_injection_blocked", { userId: user.id, field: "recipientAddress" });
      return errorResponse("Invalid input detected", 400);
    }

    // Validate amount > 0
    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      return errorResponse("Amount must be a positive number", 400);
    }

    // Server-side price calculation - never trust client-side amounts
    const rate = await fetchRate(fromAsset.toUpperCase(), toAsset.toUpperCase());
    const toAmount = (amountNum * parseFloat(rate)).toFixed(2);
    const xdr = await buildSendTransaction({
      sourcePublicKey: user.stellarPublicKey,
      fromAsset: fromAsset.toUpperCase(),
      toAsset: toAsset.toUpperCase(),
      fromAmount: amount,
      toAmount,
      recipientAddress: cleanRecipient,
    });

    const { data: transaction, error } = await supabase
      .from("transactions")
      .insert({
        userId: user.id,
        fromAsset: fromAsset.toUpperCase(),
        toAsset: toAsset.toUpperCase(),
        fromAmount: amount,
        toAmount,
        recipientAddress: cleanRecipient,
        status: "pending",
      })
      .select("id")
      .single();

    if (error || !transaction) {
      console.error("Transaction insert error:", error);
      return errorResponse("Failed to record transaction", 500);
    }

    return successResponse({
      transactionId: transaction.id,
      xdr,
      fromAsset: fromAsset.toUpperCase(),
      toAsset: toAsset.toUpperCase(),
      fromAmount: amount,
      toAmount,
      recipientAddress: cleanRecipient,
    }, 201);
  } catch (err: unknown) {
    console.error("Send error:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    if (message.includes("Invalid recipient")) {
      return errorResponse(message, 400);
    }
    if (message.includes("Request body too large")) {
      return errorResponse("Request body too large", 413);
    }
    return errorResponse(message || "Failed to build transaction", 500);
  }
}