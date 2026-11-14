import { NextRequest } from "next/server";
import { TransactionBuilder } from "@stellar/stellar-sdk";
import { data } from "@/lib/data";
import { getCurrentUser } from "@/lib/auth";
import { buildSendTransaction, resolveAsset, server, NETWORK_PASSPHRASE } from "@/lib/stellar";
import { discoverRoutes } from "@/lib/routing";
import { applySlippageBps, fromStroops, toStroops } from "@/lib/amounts";
import { stellarSendSchema } from "@/lib/validations";
import { successResponse, errorResponse, unauthorizedResponse } from "@/lib/api-response";
import {
  rateLimit,
  sanitizeInput,
  detectPromptInjection,
  logSecurityEvent,
  readBodyWithLimit,
} from "@/lib/security";

// API routes must not pre-render
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return unauthorizedResponse();
    }

    if (!user.stellarPublicKey) {
      return errorResponse("Connect a Stellar wallet before sending.", 400);
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
      return errorResponse(parsed.error.issues[0]?.message ?? "Invalid send request", 400);
    }

    const { fromAsset, toAsset, amount, recipientAddress } = parsed.data;

    // Sanitize inputs
    const cleanRecipient = sanitizeInput(recipientAddress, 56);

    // Prompt injection detection on free-text fields
    if (detectPromptInjection(cleanRecipient)) {
      logSecurityEvent("prompt_injection_blocked", { userId: user.id, field: "recipientAddress" });
      return errorResponse("Invalid input detected", 400);
    }

    const from = fromAsset.toUpperCase();
    const to = toAsset.toUpperCase();

    // The receive amount comes from on-chain path finding, never from a client
    // value or a fiat reference rate.
    let sourceAsset, destAsset;
    try {
      sourceAsset = resolveAsset(from);
      destAsset = resolveAsset(to);
    } catch (err) {
      return errorResponse(err instanceof Error ? err.message : "Unsupported asset", 422);
    }
    const discovery = await discoverRoutes(
      { from, to, amount, sourceAsset, destAsset },
      server as unknown as Parameters<typeof discoverRoutes>[1]
    );
    if (!discovery.best) {
      return errorResponse(`No route found from ${from} to ${to} for this amount.`, 422);
    }
    const best = discovery.best;
    const slippageBps = 100; // 1%: the transaction fails on-chain if the recipient would get less
    const destMin = fromStroops(applySlippageBps(toStroops(best.receiveAmount), slippageBps));
    const toAmount = best.receiveAmount;

    const xdr = await buildSendTransaction({
      sourcePublicKey: user.stellarPublicKey,
      fromAsset: from,
      toAsset: to,
      fromAmount: amount,
      destMin,
      recipientAddress: cleanRecipient,
      path: best.pathAssets,
      feeStroops: best.cost.networkFeeStroops,
    });

    const unsignedTxHash = TransactionBuilder.fromXDR(xdr, NETWORK_PASSPHRASE).hash().toString("hex");

    const transaction = await data.transactions.create({
      userId: user.id,
      fromAsset: from,
      toAsset: to,
      fromAmount: amount,
      toAmount,
      destMin,
      unsignedTxHash,
      recipientAddress: cleanRecipient,
      status: "pending",
      stellarTxHash: null,
      escrowId: null,
      confirmedAt: null,
    });

    return successResponse({
      transactionId: transaction.id,
      xdr,
      networkPassphrase: NETWORK_PASSPHRASE,
      fromAsset: from,
      toAsset: to,
      fromAmount: amount,
      toAmount,
      destMin,
      route: best.hops,
      cost: best.cost,
      recipientAddress: cleanRecipient,
    }, 201);
  } catch (err: unknown) {
    console.error("Send transaction error:", err);
    return errorResponse(err instanceof Error ? err.message : "Failed to build transaction", 500);
  }
}
