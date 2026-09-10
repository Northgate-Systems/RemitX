import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockFrom } = vi.hoisted(() => ({ mockFrom: vi.fn() }));

vi.mock("@/lib/supabase", () => ({
  supabase: { from: mockFrom },
}));

import {
  claimPendingTransaction,
  releasePendingClaim,
  finalizeTransaction,
} from "../transaction-state";

const TX_ID = "660e8400-e29b-41d4-a716-446655440000";

type ChainResult = { data?: unknown; error?: { message: string } | null };

type Chain = {
  update: ReturnType<typeof vi.fn>;
  select: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  maybeSingle: ReturnType<typeof vi.fn>;
  then: (resolve: (value: ChainResult) => unknown) => Promise<unknown>;
  filters: [string, unknown][];
  payload: Record<string, unknown> | null;
};

/**
 * Minimal stand-in for a supabase-js query builder: every method returns the
 * chain, the terminal `maybeSingle()` (or awaiting the chain directly, as the
 * release path does) resolves to the supplied result, and the applied filters
 * are recorded so a test can assert the compare-and-set condition is present.
 */
function makeChain(result: ChainResult): Chain {
  const chain = {
    filters: [] as [string, unknown][],
    payload: null as Record<string, unknown> | null,
  } as Chain;

  chain.update = vi.fn((payload: Record<string, unknown>) => {
    chain.payload = payload;
    return chain;
  });
  chain.select = vi.fn(() => chain);
  chain.eq = vi.fn((column: string, value: unknown) => {
    chain.filters.push([column, value]);
    return chain;
  });
  chain.maybeSingle = vi.fn(async () => result);
  chain.then = (resolve) => Promise.resolve(result).then(resolve);

  return chain;
}

/** Queue the chains that successive `supabase.from(...)` calls return. */
function queueChains(...chains: Chain[]) {
  mockFrom.mockReset();
  chains.forEach((chain) => mockFrom.mockReturnValueOnce(chain));
}

function fakeTx(status: string) {
  return {
    id: TX_ID,
    userId: "550e8400-e29b-41d4-a716-446655440000",
    fromAsset: "USD",
    toAsset: "XLM",
    fromAmount: "100",
    toAmount: "50",
    recipientAddress: "GABC",
    stellarTxHash: null,
    escrowId: null,
    status,
    createdAt: new Date().toISOString(),
    confirmedAt: null,
    updatedAt: new Date().toISOString(),
  };
}

beforeEach(() => {
  mockFrom.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("claimPendingTransaction", () => {
  it("claims a pending transaction and returns the updated row", async () => {
    const chain = makeChain({ data: fakeTx("validating"), error: null });
    queueChains(chain);

    const result = await claimPendingTransaction(TX_ID);

    expect(result.claimed).toBe(true);
    if (result.claimed) {
      expect(result.transaction.status).toBe("validating");
    }
    expect(chain.payload).toEqual({ status: "validating" });
    // Only one round trip: no read-back needed on the happy path.
    expect(mockFrom).toHaveBeenCalledTimes(1);
  });

  it("makes the pending->validating write conditional on the current status", async () => {
    const chain = makeChain({ data: fakeTx("validating"), error: null });
    queueChains(chain);

    await claimPendingTransaction(TX_ID);

    // This is the whole point of the fix: without .eq("status", "pending")
    // the database cannot arbitrate between two concurrent submitters.
    expect(chain.filters).toContainEqual(["status", "pending"]);
    expect(chain.filters).toContainEqual(["id", TX_ID]);
  });

  it("refuses the claim when another request already moved the row on", async () => {
    // The conditional update matches nothing...
    const updateChain = makeChain({ data: null, error: null });
    // ...and the read-back shows why: someone else is already submitting it.
    const readChain = makeChain({ data: fakeTx("validating"), error: null });
    queueChains(updateChain, readChain);

    const result = await claimPendingTransaction(TX_ID);

    expect(result).toEqual({
      claimed: false,
      reason: "already_claimed",
      status: "validating",
    });
  });

  it("reports a confirmed transaction as already claimed, not as claimable", async () => {
    queueChains(
      makeChain({ data: null, error: null }),
      makeChain({ data: fakeTx("confirmed"), error: null })
    );

    const result = await claimPendingTransaction(TX_ID);

    expect(result).toEqual({
      claimed: false,
      reason: "already_claimed",
      status: "confirmed",
    });
  });

  it("distinguishes a missing transaction from a lost race", async () => {
    queueChains(
      makeChain({ data: null, error: null }),
      makeChain({ data: null, error: null })
    );

    const result = await claimPendingTransaction(TX_ID);

    expect(result).toEqual({ claimed: false, reason: "not_found" });
  });

  it("throws when the claim write itself fails", async () => {
    queueChains(makeChain({ data: null, error: { message: "connection reset" } }));

    await expect(claimPendingTransaction(TX_ID)).rejects.toThrow("connection reset");
  });
});

describe("releasePendingClaim", () => {
  it("moves the row back to pending so the payment can be retried", async () => {
    const chain = makeChain({ data: null, error: null });
    queueChains(chain);

    await releasePendingClaim(TX_ID);

    expect(chain.payload).toEqual({ status: "pending" });
    expect(chain.filters).toContainEqual(["id", TX_ID]);
    // Never drag an already-finalized row back to pending.
    expect(chain.filters).toContainEqual(["status", "validating"]);
  });

  it("swallows database errors so it cannot mask the original failure", async () => {
    queueChains(makeChain({ data: null, error: { message: "connection reset" } }));

    await expect(releasePendingClaim(TX_ID)).resolves.toBeUndefined();
  });

  it("swallows a thrown client error too", async () => {
    mockFrom.mockReset();
    mockFrom.mockImplementation(() => {
      throw new Error("supabase not configured");
    });

    await expect(releasePendingClaim(TX_ID)).resolves.toBeUndefined();
  });
});

describe("finalizeTransaction", () => {
  it("records a confirmed transaction with its hash and a confirmedAt stamp", async () => {
    const chain = makeChain({ data: fakeTx("confirmed"), error: null });
    queueChains(chain);

    const result = await finalizeTransaction(TX_ID, {
      status: "confirmed",
      stellarTxHash: "abc123",
    });

    expect(result?.status).toBe("confirmed");
    expect(chain.payload?.status).toBe("confirmed");
    expect(chain.payload?.stellarTxHash).toBe("abc123");
    expect(chain.payload?.confirmedAt).toBeTypeOf("string");
    // Only the request holding the claim may write the terminal state.
    expect(chain.filters).toContainEqual(["status", "validating"]);
  });

  it("leaves confirmedAt null for a failed submission", async () => {
    const chain = makeChain({ data: fakeTx("failed"), error: null });
    queueChains(chain);

    await finalizeTransaction(TX_ID, { status: "failed", stellarTxHash: null });

    expect(chain.payload?.confirmedAt).toBeNull();
    expect(chain.payload?.stellarTxHash).toBeNull();
  });

  it("returns null when the row is no longer in the expected state", async () => {
    queueChains(makeChain({ data: null, error: null }));

    await expect(
      finalizeTransaction(TX_ID, { status: "confirmed", stellarTxHash: "abc123" })
    ).resolves.toBeNull();
  });

  it("returns null instead of throwing when the write errors", async () => {
    queueChains(makeChain({ data: null, error: { message: "connection reset" } }));

    await expect(
      finalizeTransaction(TX_ID, { status: "confirmed", stellarTxHash: "abc123" })
    ).resolves.toBeNull();
  });
});
