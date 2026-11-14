import { randomUUID } from "node:crypto";
import type { User, Transaction, Rate, Escrow } from "../types";
import type {
  UserRepository,
  TransactionRepository,
  RateRepository,
  EscrowRepository,
  DataRepositories,
} from "../repositories";
import {
  SEED_USERS,
  SEED_TRANSACTIONS,
  SEED_ESCROWS,
  SEED_RATES,
} from "./seed-data";

function clone<T>(val: T): T {
  return JSON.parse(JSON.stringify(val));
}

// Module-level in-memory storage maps
const usersMap = new Map<string, User>();
const transactionsMap = new Map<string, Transaction>();
const ratesMap = new Map<string, Rate>();
const escrowsMap = new Map<string, Escrow>();
const metaMap = new Map<string, string>();

export function resetMemoryStore(): void {
  usersMap.clear();
  transactionsMap.clear();
  ratesMap.clear();
  escrowsMap.clear();
  metaMap.clear();

  for (const u of SEED_USERS) usersMap.set(u.id, clone(u));
  for (const t of SEED_TRANSACTIONS) transactionsMap.set(t.id, clone(t));
  for (const r of SEED_RATES) ratesMap.set(`${r.fromAsset}:${r.toAsset}`, clone(r));
  for (const e of SEED_ESCROWS) escrowsMap.set(e.id, clone(e));
}

// Initialize seed data on module import
resetMemoryStore();

export class MemoryUserRepository implements UserRepository {
  async findById(id: string): Promise<User | null> {
    const user = usersMap.get(id);
    return user ? clone(user) : null;
  }

  async findByEmail(email: string): Promise<User | null> {
    const normalized = email.trim().toLowerCase();
    for (const user of usersMap.values()) {
      if (user.email.toLowerCase() === normalized) {
        return clone(user);
      }
    }
    return null;
  }

  async findByStellarPublicKey(publicKey: string): Promise<User | null> {
    const key = publicKey.trim();
    for (const user of usersMap.values()) {
      if (user.stellarPublicKey === key) {
        return clone(user);
      }
    }
    return null;
  }

  async create(
    data: Omit<User, "id" | "createdAt" | "updatedAt"> & {
      id?: string;
      createdAt?: string;
      updatedAt?: string;
    }
  ): Promise<User> {
    const now = new Date().toISOString();
    const id = data.id || `usr_${randomUUID()}`;
    const user: User = {
      id,
      email: data.email.trim().toLowerCase(),
      firstName: data.firstName,
      lastName: data.lastName,
      passwordHash: data.passwordHash,
      stellarPublicKey: data.stellarPublicKey ?? null,
      kycStatus: data.kycStatus ?? "pending",
      sessionVersion: data.sessionVersion ?? 1,
      failedLoginAttempts: data.failedLoginAttempts ?? 0,
      lockedUntil: data.lockedUntil ?? null,
      createdAt: data.createdAt ?? now,
      updatedAt: data.updatedAt ?? now,
    };
    usersMap.set(id, clone(user));
    return clone(user);
  }

  async update(
    id: string,
    data: Partial<Omit<User, "id" | "createdAt">>
  ): Promise<User | null> {
    const existing = usersMap.get(id);
    if (!existing) return null;

    const updated: User = {
      ...existing,
      ...data,
      updatedAt: new Date().toISOString(),
    };
    usersMap.set(id, clone(updated));
    return clone(updated);
  }

  async list(): Promise<User[]> {
    return Array.from(usersMap.values()).map(clone);
  }
}

export class MemoryTransactionRepository implements TransactionRepository {
  async findById(id: string): Promise<Transaction | null> {
    const tx = transactionsMap.get(id);
    return tx ? clone(tx) : null;
  }

  async findByUserId(
    userId: string,
    options?: { limit?: number; offset?: number }
  ): Promise<{ transactions: Transaction[]; total: number }> {
    const list = Array.from(transactionsMap.values())
      .filter((t) => t.userId === userId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const total = list.length;
    const offset = options?.offset ?? 0;
    const limit = options?.limit ?? 50;
    const paged = list.slice(offset, offset + limit).map(clone);

    return { transactions: paged, total };
  }

  async create(
    data: Omit<Transaction, "id" | "createdAt" | "updatedAt"> & {
      id?: string;
      createdAt?: string;
      updatedAt?: string;
    }
  ): Promise<Transaction> {
    const now = new Date().toISOString();
    const id = data.id || `tx_${randomUUID()}`;
    const tx: Transaction = {
      id,
      userId: data.userId,
      fromAsset: data.fromAsset.toUpperCase(),
      toAsset: data.toAsset.toUpperCase(),
      fromAmount: String(data.fromAmount),
      toAmount: data.toAmount !== null && data.toAmount !== undefined ? String(data.toAmount) : null,
      destMin: data.destMin !== null && data.destMin !== undefined ? String(data.destMin) : null,
      unsignedTxHash: data.unsignedTxHash ?? null,
      recipientAddress: data.recipientAddress,
      stellarTxHash: data.stellarTxHash ?? null,
      escrowId: data.escrowId ?? null,
      status: data.status ?? "pending",
      createdAt: data.createdAt ?? now,
      confirmedAt: data.confirmedAt ?? null,
      updatedAt: data.updatedAt ?? now,
    };
    transactionsMap.set(id, clone(tx));
    return clone(tx);
  }

  async update(
    id: string,
    data: Partial<Omit<Transaction, "id" | "createdAt">>
  ): Promise<Transaction | null> {
    const existing = transactionsMap.get(id);
    if (!existing) return null;

    const updated: Transaction = {
      ...existing,
      ...data,
      fromAmount: data.fromAmount !== undefined ? String(data.fromAmount) : existing.fromAmount,
      toAmount: data.toAmount !== undefined ? (data.toAmount ? String(data.toAmount) : null) : existing.toAmount,
      updatedAt: new Date().toISOString(),
    };
    transactionsMap.set(id, clone(updated));
    return clone(updated);
  }

  async list(): Promise<Transaction[]> {
    return Array.from(transactionsMap.values()).map(clone);
  }
}

export class MemoryRateRepository implements RateRepository {
  private key(from: string, to: string): string {
    return `${from.trim().toUpperCase()}:${to.trim().toUpperCase()}`;
  }

  async findRate(fromAsset: string, toAsset: string): Promise<Rate | null> {
    const r = ratesMap.get(this.key(fromAsset, toAsset));
    return r ? clone(r) : null;
  }

  async upsertRate(
    fromAsset: string,
    toAsset: string,
    rate: string
  ): Promise<Rate> {
    const k = this.key(fromAsset, toAsset);
    const existing = ratesMap.get(k);
    const now = new Date().toISOString();
    const entry: Rate = {
      id: existing?.id || `rate_${randomUUID()}`,
      fromAsset: fromAsset.toUpperCase(),
      toAsset: toAsset.toUpperCase(),
      rate: String(rate),
      fetchedAt: now,
    };
    ratesMap.set(k, clone(entry));
    return clone(entry);
  }

  async list(): Promise<Rate[]> {
    return Array.from(ratesMap.values()).map(clone);
  }
}

export class MemoryEscrowRepository implements EscrowRepository {
  async findById(id: string): Promise<Escrow | null> {
    const e = escrowsMap.get(id);
    return e ? clone(e) : null;
  }

  async findByTransactionId(transactionId: string): Promise<Escrow | null> {
    for (const escrow of escrowsMap.values()) {
      if (escrow.transactionId === transactionId) {
        return clone(escrow);
      }
    }
    return null;
  }

  async findByUserId(userId: string): Promise<Escrow[]> {
    return Array.from(escrowsMap.values())
      .filter((e) => e.userId === userId)
      .map(clone);
  }

  async findBySenderAddress(senderAddress: string): Promise<Escrow[]> {
    return Array.from(escrowsMap.values())
      .filter((e) => e.senderAddress === senderAddress)
      .map(clone);
  }

  async findByRecipientAddress(recipientAddress: string): Promise<Escrow[]> {
    return Array.from(escrowsMap.values())
      .filter((e) => e.recipientAddress === recipientAddress)
      .map(clone);
  }

  async create(
    data: Omit<Escrow, "id" | "createdAt" | "updatedAt"> & {
      id?: string;
      createdAt?: string;
      updatedAt?: string;
    }
  ): Promise<Escrow> {
    const now = new Date().toISOString();
    const id = data.id || `escrow_${randomUUID()}`;
    const escrow: Escrow = {
      id,
      userId: data.userId,
      transactionId: data.transactionId,
      contractAddress: data.contractAddress,
      senderAddress: data.senderAddress,
      recipientAddress: data.recipientAddress,
      amount: String(data.amount),
      asset: data.asset.toUpperCase(),
      status: data.status ?? "locked",
      depositTxHash: data.depositTxHash ?? null,
      releaseTxHash: data.releaseTxHash ?? null,
      createdAt: data.createdAt ?? now,
      expiresAt: data.expiresAt,
      updatedAt: data.updatedAt ?? now,
    };
    escrowsMap.set(id, clone(escrow));
    return clone(escrow);
  }

  async update(
    id: string,
    data: Partial<Omit<Escrow, "id" | "createdAt">>
  ): Promise<Escrow | null> {
    const existing = escrowsMap.get(id);
    if (!existing) return null;

    const updated: Escrow = {
      ...existing,
      ...data,
      amount: data.amount !== undefined ? String(data.amount) : existing.amount,
      updatedAt: new Date().toISOString(),
    };
    escrowsMap.set(id, clone(updated));
    return clone(updated);
  }

  async list(): Promise<Escrow[]> {
    return Array.from(escrowsMap.values()).map(clone);
  }
}

class MemoryMetaRepository {
  async get(key: string): Promise<string | null> {
    return metaMap.get(key) ?? null;
  }
  async set(key: string, value: string): Promise<void> {
    metaMap.set(key, value);
  }
}

export function createMemoryRepositories(): DataRepositories {
  return {
    meta: new MemoryMetaRepository(),
    users: new MemoryUserRepository(),
    transactions: new MemoryTransactionRepository(),
    rates: new MemoryRateRepository(),
    escrows: new MemoryEscrowRepository(),
  };
}

