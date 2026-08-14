import { NextRequest } from "next/server";
import { Asset } from "@stellar/stellar-sdk";
import { getCurrentUser } from "@/lib/auth";
import { server } from "@/lib/stellar";
import { successResponse, errorResponse, unauthorizedResponse } from "@/lib/api-response";

function resolvePathAsset(code: string): Asset {
  const upper = code.toUpperCase();
  if (upper === "XLM") return Asset.native();
  const issuer = process.env[`STELLAR_${upper}_ISSUER`];
  if (!issuer) throw new Error(`No configured issuer for ${upper}`);
  return new Asset(upper, issuer);
}

/** Real Stellar path-finding via Horizon's /paths/strict-send — returns the
 * actual on-chain routes available right now for a given send amount, no
 * fabricated providers or fee tables. */
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return unauthorizedResponse();

    const { searchParams } = new URL(request.url);
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const amount = searchParams.get("amount") || "100";

    if (!from || !to) {
      return errorResponse("from and to query parameters are required", 400);
    }

    let sourceAsset: Asset;
    let destAsset: Asset;
    try {
      sourceAsset = resolvePathAsset(from);
      destAsset = resolvePathAsset(to);
    } catch (err) {
      return errorResponse(err instanceof Error ? err.message : "Unsupported asset", 422);
    }

    const paths = await server
      .strictSendPaths(sourceAsset, amount, [destAsset])
      .call();

    const routes = paths.records.map((r) => ({
      sourceAmount: r.source_amount,
      destinationAmount: r.destination_amount,
      path: [
        from.toUpperCase(),
        ...r.path.map((p) => (p.asset_type === "native" ? "XLM" : p.asset_code || "?")),
        to.toUpperCase(),
      ],
    }));

    return successResponse({ routes, from: from.toUpperCase(), to: to.toUpperCase(), amount });
  } catch (err: unknown) {
    console.error("Routes fetch error:", err);
    const message = err instanceof Error ? err.message : "Failed to fetch routes";
    return errorResponse(message, 500);
  }
}
