import { Asset, Keypair, Operation, TransactionBuilder } from "@stellar/stellar-sdk";
import { toStroops } from "./amounts";
import { resolveAsset } from "./stellar";

export class TxMismatchError extends Error {}

export interface ExpectedTransfer {
  source: string;
  recipient: string;
  fromAmount: string;
  networkPassphrase: string;
  fromAsset?: Asset | string;
  toAsset?: Asset | string;
  destMin?: string;
  unsignedTxHash?: string;
}

function normalizeAsset(asset: Asset | string): Asset {
  return typeof asset === "string" ? resolveAsset(asset) : asset;
}

/**
 * Checks that a wallet-signed XDR is the transfer we created: right source,
 * a single path-payment-strict-send to the stored recipient for the stored
 * amount/assets/destMin floor (and optional unsigned transaction hash), and a
 * valid signature from the source account. Without this a user could submit
 * a modified transaction and have the record marked "confirmed".
 */
export function assertSignedXdrMatches(
  signedXdr: string,
  expected: ExpectedTransfer
): void {
  let tx;
  try {
    tx = TransactionBuilder.fromXDR(signedXdr, expected.networkPassphrase);
  } catch {
    throw new TxMismatchError("Signed transaction could not be parsed");
  }
  if ("innerTransaction" in tx) throw new TxMismatchError("Fee-bump transactions are not accepted");
  if (tx.source !== expected.source) throw new TxMismatchError("Transaction source does not match your account");
  if (tx.operations.length !== 1) throw new TxMismatchError("Transaction must contain exactly one operation");

  const op = tx.operations[0] as Operation.PathPaymentStrictSend;
  if (op.type !== "pathPaymentStrictSend") throw new TxMismatchError("Unexpected operation type");
  if (op.source && op.source !== expected.source) {
    throw new TxMismatchError("Operation source does not match your account");
  }
  if (op.destination !== expected.recipient) throw new TxMismatchError("Recipient does not match the transfer");
  if (toStroops(op.sendAmount) !== toStroops(expected.fromAmount)) {
    throw new TxMismatchError("Amount does not match the transfer");
  }

  if (expected.fromAsset !== undefined) {
    const expectedSendAsset = normalizeAsset(expected.fromAsset);
    if (!op.sendAsset.equals(expectedSendAsset)) {
      throw new TxMismatchError("Send asset does not match the transfer");
    }
  }

  if (expected.toAsset !== undefined) {
    const expectedDestAsset = normalizeAsset(expected.toAsset);
    if (!op.destAsset.equals(expectedDestAsset)) {
      throw new TxMismatchError("Destination asset does not match the transfer");
    }
  }

  if (expected.destMin !== undefined) {
    if (toStroops(op.destMin) < toStroops(expected.destMin)) {
      throw new TxMismatchError("Minimum destination amount is below the transfer floor");
    }
  }

  const hash = tx.hash();
  if (expected.unsignedTxHash && hash.toString("hex") !== expected.unsignedTxHash) {
    throw new TxMismatchError("Signed transaction hash does not match the prepared transfer");
  }

  const keypair = Keypair.fromPublicKey(expected.source);
  const signed = tx.signatures.some((s) => {
    try {
      return keypair.verify(hash, s.signature());
    } catch {
      return false;
    }
  });
  if (!signed) throw new TxMismatchError("Transaction is not signed by your account");
}
