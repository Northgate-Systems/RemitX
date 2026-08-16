/**
 * Hand-written row types matching the Supabase schema (see
 * supabase-schema.sql). There's no Prisma client generating these anymore —
 * if you add/change a column, update both the SQL and this file.
 */

export type KycStatus = "pending" | "verified" | "rejected";
export type TransactionStatus = "pending" | "validating" | "confirmed" | "failed";
export type EscrowStatus = "locked" | "released" | "refunded" | "expired";

export type User = {
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

export type Transaction = {
  id: string;
  userId: string;
  fromAsset: string;
  toAsset: string;
  fromAmount: string;
  toAmount: string | null;
  recipientAddress: string;
  stellarTxHash: string | null;
  escrowId: string | null;
  status: TransactionStatus;
  createdAt: string;
  confirmedAt: string | null;
  updatedAt: string;
}

export type Escrow = {
  id: string;
  userId: string;
  transactionId: string;
  contractAddress: string;
  senderAddress: string;
  recipientAddress: string;
  amount: string;
  asset: string;
  status: EscrowStatus;
  depositTxHash: string | null;
  releaseTxHash: string | null;
  createdAt: string;
  expiresAt: string;
  updatedAt: string;
}

export type Rate = {
  id: string;
  fromAsset: string;
  toAsset: string;
  rate: string;
  fetchedAt: string;
}

// ── Supabase Database type ──────────────────────────────────────────────
// Hand-written to match supabase-schema.sql. Passed as the generic to
// createClient<Database>() in lib/supabase.ts so insert()/update() calls
// are typed instead of falling back to `never`. Shape matches
// @supabase/postgrest-js's GenericTable/GenericSchema exactly (Row/Insert/
// Update/Relationships per table, Tables/Views/Functions per schema).
type Tables<Row, Insert extends object> = {
  Row: Row;
  Insert: Insert;
  Update: Partial<Insert>;
  Relationships: [];
};

export type Database = {
  public: {
    Tables: {
      users: Tables<
        User,
        Partial<
          Pick<
            User,
            | "id"
            | "kycStatus"
            | "stellarPublicKey"
            | "sessionVersion"
            | "failedLoginAttempts"
            | "lockedUntil"
            | "createdAt"
            | "updatedAt"
          >
        > &
          Pick<User, "email" | "firstName" | "lastName" | "passwordHash">
      >;
      transactions: Tables<
        Transaction,
        Partial<
          Pick<
            Transaction,
            | "id"
            | "toAmount"
            | "stellarTxHash"
            | "escrowId"
            | "status"
            | "createdAt"
            | "confirmedAt"
            | "updatedAt"
          >
        > &
          Pick<Transaction, "userId" | "fromAsset" | "toAsset" | "fromAmount" | "recipientAddress">
      >;
      escrows: Tables<
        Escrow,
        Partial<
          Pick<
            Escrow,
            "id" | "status" | "depositTxHash" | "releaseTxHash" | "createdAt" | "updatedAt"
          >
        > &
          Pick<
            Escrow,
            | "userId"
            | "transactionId"
            | "contractAddress"
            | "senderAddress"
            | "recipientAddress"
            | "amount"
            | "asset"
            | "expiresAt"
          >
      >;
      rates: Tables<Rate, Partial<Pick<Rate, "id" | "fetchedAt">> & Pick<Rate, "fromAsset" | "toAsset" | "rate">>;
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
  };
};
