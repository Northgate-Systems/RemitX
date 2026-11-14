export type KycStatus = "pending" | "verified" | "rejected";
export type TransactionStatus = "pending" | "validating" | "confirmed" | "failed";
export type EscrowStatus = "locked" | "released" | "refunded" | "expired";

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  passwordHash: string;
  stellarPublicKey: string | null;
  kycStatus: KycStatus;
  sessionVersion: number;
  failedLoginAttempts: number;
  lockedUntil: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Transaction {
  id: string;
  userId: string;
  fromAsset: string;
  toAsset: string;
  fromAmount: string; // stored as string to avoid precision loss
  toAmount: string | null;
  destMin?: string | null;
  unsignedTxHash?: string | null;
  recipientAddress: string;
  stellarTxHash: string | null;
  escrowId: string | null;
  status: TransactionStatus;
  createdAt: string;
  confirmedAt: string | null;
  updatedAt: string;
}

export interface Rate {
  id: string;
  fromAsset: string;
  toAsset: string;
  rate: string; // stored as string to avoid precision loss
  fetchedAt: string;
}

export interface Escrow {
  id: string;
  userId: string;
  transactionId: string;
  contractAddress: string;
  senderAddress: string;
  recipientAddress: string;
  amount: string; // stored as string to avoid precision loss
  asset: string;
  status: EscrowStatus;
  depositTxHash: string | null;
  releaseTxHash: string | null;
  createdAt: string;
  expiresAt: string;
  updatedAt: string;
}

