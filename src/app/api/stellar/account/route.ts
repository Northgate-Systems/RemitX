import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { createTestnetAccount } from "@/lib/stellar";
import { successResponse, errorResponse, unauthorizedResponse } from "@/lib/api-response";

export async function POST() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return unauthorizedResponse();
    }

    if (user.stellarPublicKey) {
      return errorResponse("Account already has a Stellar public key.", 409);
    }

    const account = await createTestnetAccount();

    await db.user.update({
      where: { id: user.id },
      data: { stellarPublicKey: account.publicKey },
    });

    // The secret key is returned exactly once, here, and never stored
    // server-side. If the user loses it, this testnet account is gone —
    // that's the correct tradeoff for a non-custodial wallet, even in dev.
    return successResponse(
      {
        publicKey: account.publicKey,
        secretKey: account.secretKey,
        warning:
          "Save this secret key now — it will not be shown again and is not stored on the server.",
      },
      201
    );
  } catch (err) {
    console.error("Account creation error:", err);
    return errorResponse("Failed to create Stellar account", 500);
  }
}
