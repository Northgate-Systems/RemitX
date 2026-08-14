import { NextRequest } from "next/server";
import { Asset } from "@stellar/stellar-sdk";
import { getCurrentUser } from "@/lib/auth";
import { server } from "@/lib/stellar";
import { successResponse, errorResponse, unauthorizedResponse } from "@/lib/api-response";

/** Real Horizon liquidity pool reserves for a given asset code (top pool by
 * reserve size). Returns null data if the asset has no configured issuer or
 * no pool exists — never a fabricated figure. */
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return unauthorizedResponse();

    const { searchParams } = new URL(request.url);
    const assetCode = searchParams.get("asset");
    if (!assetCode) return errorResponse("asset query parameter is required", 400);

    const upper = assetCode.toUpperCase();
    let asset: Asset;
    if (upper === "XLM") {
      asset = Asset.native();
    } else {
      const issuer = process.env[`STELLAR_${upper}_ISSUER`];
      if (!issuer) {
        return successResponse({ pool: null, reason: `No issuer configured for ${upper}` });
      }
      asset = new Asset(upper, issuer);
    }

    const pools = await server
      .liquidityPools()
      .forAssets(asset)
      .limit(1)
      .order("desc")
      .call();

    const top = pools.records[0];
    if (!top) {
      return successResponse({ pool: null, reason: `No liquidity pool found for ${upper}` });
    }

    return successResponse({
      pool: {
        id: top.id,
        reserves: top.reserves.map((r) => ({ asset: r.asset, amount: r.amount })),
        totalShares: top.total_shares,
      },
    });
  } catch (err: unknown) {
    console.error("Liquidity fetch error:", err);
    return errorResponse(err instanceof Error ? err.message : "Failed to fetch liquidity", 500);
  }
}
