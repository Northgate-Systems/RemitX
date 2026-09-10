import { supabase } from "@/lib/supabase";
import type { Transaction, TransactionStatus } from "@/lib/types";

/**
 * Atomic status transitions for the `transactions` table.
 *
 * The submit routes (`/api/stellar/submit`, `/api/stellar/sign-and-submit`)
 * do a read-then-write pair: they read a transaction, check it is still
 * `pending`, and then flip it to `validating` before broadcasting the signed
 * XDR to Horizon. Read and write are two separate round trips, so two
 * requests carrying the same transactionId can both pass the `pending` check
 * and both broadcast — the user's payment gets submitted twice.
 *
 * The API routes talk to the database through supabase-js, not through
 * Prisma (`@/lib/db` is only used by `/api/health`), so there is no
 * `$transaction` to wrap this in. The equivalent guarantee at this layer is
 * a conditional update — a compare-and-set: the `pending -> validating`
 * write carries `.eq("status", "pending")` so the database itself decides
 * the winner, and the loser gets back zero rows.
 */

export type ClaimFailureReason = "not_found" | "already_claimed";

export type ClaimResult =
  | { claimed: true; transaction: Transaction }
  | { claimed: false; reason: ClaimFailureReason; status?: TransactionStatus };

/**
 * Move a transaction from `pending` to `validating`, but only if it is still
 * `pending` at the moment of the write.
 *
 * Exactly one concurrent caller can succeed. Everyone else gets
 * `claimed: false` with the status the row actually holds, so the caller can
 * answer with a meaningful error instead of broadcasting a duplicate.
 */
export async function claimPendingTransaction(
  transactionId: string
): Promise<ClaimResult> {
  const { data, error } = await supabase
    .from("transactions")
    .update({ status: "validating" })
    .eq("id", transactionId)
    .eq("status", "pending")
    .select("*")
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to claim transaction: ${error.message}`);
  }

  if (data) {
    return { claimed: true, transaction: data as Transaction };
  }

  // Zero rows updated: either the id doesn't exist, or someone else already
  // moved it out of `pending`. Read it back to tell those two apart, so the
  // route can keep answering 404 vs 409 correctly.
  const { data: current } = await supabase
    .from("transactions")
    .select("*")
    .eq("id", transactionId)
    .maybeSingle();

  if (!current) {
    return { claimed: false, reason: "not_found" };
  }

  return {
    claimed: false,
    reason: "already_claimed",
    status: (current as Transaction).status,
  };
}

/**
 * Undo a claim: put a `validating` row back to `pending`.
 *
 * Used when the broadcast never happened (building/signing blew up, or the
 * Horizon call threw before the network saw anything). Without this the row
 * stays `validating` forever and every retry is rejected by the
 * `status !== "pending"` guard — the payment becomes permanently unusable
 * even though nothing was ever submitted.
 *
 * Guarded with `.eq("status", "validating")` so a row that has meanwhile
 * been finalized as confirmed/failed is never dragged back to `pending`.
 * Never throws: it runs on an error path and must not mask the original
 * failure.
 */
export async function releasePendingClaim(transactionId: string): Promise<void> {
  try {
    const { error } = await supabase
      .from("transactions")
      .update({ status: "pending" })
      .eq("id", transactionId)
      .eq("status", "validating");

    if (error) {
      console.error("Failed to release transaction claim:", error.message);
    }
  } catch (err) {
    console.error("Failed to release transaction claim:", err);
  }
}

/**
 * Write the terminal state of a submitted transaction.
 *
 * Conditional on the row still being `validating` — this caller is the one
 * holding the claim, so anything else having touched it in the meantime
 * means the state machine was violated and this write must not clobber it.
 */
export async function finalizeTransaction(
  transactionId: string,
  result: { status: "confirmed" | "failed"; stellarTxHash?: string | null }
): Promise<Transaction | null> {
  const { data, error } = await supabase
    .from("transactions")
    .update({
      status: result.status,
      stellarTxHash: result.stellarTxHash ?? null,
      confirmedAt: result.status === "confirmed" ? new Date().toISOString() : null,
    })
    .eq("id", transactionId)
    .eq("status", "validating")
    .select("*")
    .maybeSingle();

  if (error) {
    console.error("Failed to finalize transaction:", error.message);
    return null;
  }

  return (data as Transaction) ?? null;
}
