import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { successResponse, errorResponse, unauthorizedResponse } from "@/lib/api-response";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return unauthorizedResponse();

  const { id } = await params;

  const tx = await db.transaction.findUnique({ where: { id } });
  if (!tx) return errorResponse("Transaction not found", 404);
  if (tx.userId !== user.id) return unauthorizedResponse();

  const escrow = await db.escrow.findUnique({ where: { transactionId: tx.id } });

  return successResponse({ transaction: tx, escrow });
}
