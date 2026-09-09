import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  Account,
  Asset,
  Keypair,
  Networks,
  Operation,
  Transaction,
  TransactionBuilder,
  BASE_FEE,
} from "@stellar/stellar-sdk";

// ---------------------------------------------------------------------------
// The whole point of this file is that it never touches the network: Horizon
// is replaced by a stub server, Friendbot by a stubbed global fetch, and the
// rate engine by a mock. Everything else (Asset, Operation, TransactionBuilder,
// Keypair) stays REAL, so the XDR these tests assert on is the same XDR
// Horizon would have received.
// ---------------------------------------------------------------------------

const { mockServer } = vi.hoisted(() => ({
  mockServer: {
    loadAccount: vi.fn(),
    ledgers: vi.fn(),
    submitTransaction: vi.fn(),
  },
}));

vi.mock("@stellar/stellar-sdk", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@stellar/stellar-sdk")>();
  return {
    ...actual,
    Horizon: {
      ...actual.Horizon,
      Server: vi.fn(() => mockServer),
    },
  };
});

const { mockGetRate } = vi.hoisted(() => ({ mockGetRate: vi.fn() }));
vi.mock("@/lib/rates", () => ({ getRate: mockGetRate }));

const SOURCE = "GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H";
const RECIPIENT = "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN";
const USDC_ISSUER = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";

/** Import the module fresh so the module-level env reads (STELLAR_NETWORK,
 *  STELLAR_HORIZON_URL) are re-evaluated per test. */
async function importStellar() {
  vi.resetModules();
  return await import("@/lib/stellar");
}

/** A Horizon AccountResponse is duck-typed here: TransactionBuilder only needs
 *  accountId()/sequenceNumber()/incrementSequenceNumber(), the lib code also
 *  reads `.balances`. */
function accountWithBalances(
  balances: Array<Record<string, unknown>>,
  accountId = SOURCE
) {
  const account = new Account(accountId, "1234") as Account & {
    balances: Array<Record<string, unknown>>;
  };
  account.balances = balances;
  return account;
}

const ENV_KEYS = [
  "STELLAR_NETWORK",
  "STELLAR_HORIZON_URL",
  "STELLAR_USDC_ISSUER",
  "STELLAR_NGNT_ISSUER",
];
const savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const key of ENV_KEYS) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
  mockServer.loadAccount.mockReset();
  mockServer.ledgers.mockReset();
  mockServer.submitTransaction.mockReset();
  mockGetRate.mockReset();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("network configuration", () => {
  it("defaults to testnet Horizon and the testnet passphrase", async () => {
    const stellar = await importStellar();
    expect(stellar.HORIZON_URL).toBe("https://horizon-testnet.stellar.org");
    expect(stellar.NETWORK_PASSPHRASE).toBe(Networks.TESTNET);
  });

  it("switches to the public passphrase when STELLAR_NETWORK is not testnet", async () => {
    process.env.STELLAR_NETWORK = "public";
    process.env.STELLAR_HORIZON_URL = "https://horizon.stellar.org";
    const stellar = await importStellar();
    expect(stellar.HORIZON_URL).toBe("https://horizon.stellar.org");
    expect(stellar.NETWORK_PASSPHRASE).toBe(Networks.PUBLIC);
  });
});

describe("createTestnetAccount", () => {
  it("returns a matching public/secret keypair and funds it via Friendbot", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, text: async () => "" });
    vi.stubGlobal("fetch", fetchMock);

    const { createTestnetAccount } = await importStellar();
    const { publicKey, secretKey } = await createTestnetAccount();

    // The secret really is the secret for that public key - not two unrelated strings.
    expect(Keypair.fromSecret(secretKey).publicKey()).toBe(publicKey);
    expect(publicKey).toMatch(/^G[A-Z2-7]{55}$/);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`https://friendbot.stellar.org?addr=${publicKey}`);
    expect(init).toEqual({ method: "GET" });
  });

  it("still returns the keypair when Friendbot answers non-OK", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: false, status: 400, text: async () => "op_already_exists" });
    vi.stubGlobal("fetch", fetchMock);

    const { createTestnetAccount } = await importStellar();
    const result = await createTestnetAccount();

    expect(Keypair.fromSecret(result.secretKey).publicKey()).toBe(result.publicKey);
    expect(console.warn).toHaveBeenCalled();
  });

  it("swallows a Friendbot network error instead of failing registration", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
    vi.stubGlobal("fetch", fetchMock);

    const { createTestnetAccount } = await importStellar();
    await expect(createTestnetAccount()).resolves.toMatchObject({
      publicKey: expect.stringMatching(/^G[A-Z2-7]{55}$/),
    });
    expect(console.warn).toHaveBeenCalled();
  });

  it("does not call Friendbot on a non-testnet network", async () => {
    process.env.STELLAR_NETWORK = "public";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { createTestnetAccount } = await importStellar();
    await createTestnetAccount();

    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("fetchRate", () => {
  it("returns just the rate string from the rate engine", async () => {
    mockGetRate.mockResolvedValue({ rate: "0.000123", source: "coingecko" });
    const { fetchRate } = await importStellar();

    await expect(fetchRate("USD", "NGN")).resolves.toBe("0.000123");
    expect(mockGetRate).toHaveBeenCalledWith("USD", "NGN");
  });

  it("propagates a rate-engine failure rather than returning a fake rate", async () => {
    mockGetRate.mockRejectedValue(new Error("rate engine down"));
    const { fetchRate } = await importStellar();

    await expect(fetchRate("USD", "NGN")).rejects.toThrow("rate engine down");
  });
});

describe("getAccountBalances", () => {
  it("maps native to XLM and credit assets to their asset code", async () => {
    mockServer.loadAccount.mockResolvedValue(
      accountWithBalances([
        { asset_type: "native", balance: "100.0000000" },
        { asset_type: "credit_alphanum4", asset_code: "USDC", balance: "42.5000000" },
      ])
    );

    const { getAccountBalances } = await importStellar();
    await expect(getAccountBalances(SOURCE)).resolves.toEqual([
      { asset: "XLM", balance: "100.0000000" },
      { asset: "USDC", balance: "42.5000000" },
    ]);
    expect(mockServer.loadAccount).toHaveBeenCalledWith(SOURCE);
  });

  it("returns [] for an account that is not funded yet (Horizon 404)", async () => {
    mockServer.loadAccount.mockRejectedValue({ response: { status: 404 } });
    const { getAccountBalances } = await importStellar();
    await expect(getAccountBalances(SOURCE)).resolves.toEqual([]);
  });

  it("rethrows non-404 Horizon errors instead of hiding them as an empty wallet", async () => {
    const boom = Object.assign(new Error("Horizon 503"), {
      response: { status: 503 },
    });
    mockServer.loadAccount.mockRejectedValue(boom);
    const { getAccountBalances } = await importStellar();
    await expect(getAccountBalances(SOURCE)).rejects.toThrow("Horizon 503");
  });
});

describe("getNetworkStatus", () => {
  it("reports the latest ledger from a desc/limit-1 query", async () => {
    const call = vi.fn().mockResolvedValue({
      records: [
        { sequence: 987654, base_fee_in_stroops: 100, closed_at: "2025-01-01T00:00:00Z" },
      ],
    });
    const limit = vi.fn(() => ({ call }));
    const order = vi.fn(() => ({ limit }));
    mockServer.ledgers.mockReturnValue({ order });

    const { getNetworkStatus } = await importStellar();
    await expect(getNetworkStatus()).resolves.toEqual({
      ledgerSequence: 987654,
      baseFeeStroops: 100,
      closedAt: "2025-01-01T00:00:00Z",
    });
    expect(order).toHaveBeenCalledWith("desc");
    expect(limit).toHaveBeenCalledWith(1);
  });
});

describe("buildSendTransaction", () => {
  const baseParams = {
    sourcePublicKey: SOURCE,
    fromAsset: "XLM",
    toAsset: "XLM",
    fromAmount: "50",
    toAmount: "50",
    recipientAddress: RECIPIENT,
  };

  it("builds a path_payment_strict_send with a 1% destMin slippage floor", async () => {
    mockServer.loadAccount.mockResolvedValue(
      accountWithBalances([{ asset_type: "native", balance: "100.0000000" }])
    );

    const { buildSendTransaction } = await importStellar();
    const xdr = await buildSendTransaction({ ...baseParams, toAmount: "123.4567891" });

    const tx = TransactionBuilder.fromXDR(xdr, Networks.TESTNET);
    expect(tx.operations).toHaveLength(1);
    const op = tx.operations[0] as Operation.PathPaymentStrictSend;
    expect(op.type).toBe("pathPaymentStrictSend");
    expect(op.destination).toBe(RECIPIENT);
    expect(op.sendAmount).toBe("50.0000000");
    // 123.4567891 * 0.99 = 122.2222212... -> 7dp, and never above toAmount.
    expect(op.destMin).toBe("122.2222212");
    expect(Number(op.destMin)).toBeLessThan(123.4567891);
    expect(op.sendAsset.isNative()).toBe(true);
    expect(op.destAsset.isNative()).toBe(true);
    expect(tx.fee).toBe(BASE_FEE);
  });

  it("sets a 180s timeout so a stale unsigned XDR cannot be replayed later", async () => {
    mockServer.loadAccount.mockResolvedValue(
      accountWithBalances([{ asset_type: "native", balance: "100.0000000" }])
    );
    const { buildSendTransaction } = await importStellar();
    // fromXDR is typed Transaction | FeeBumpTransaction; a plain built tx is
    // always the former, so narrow it to read timeBounds.
    const tx = TransactionBuilder.fromXDR(
      await buildSendTransaction(baseParams),
      Networks.TESTNET
    ) as Transaction;

    const maxTime = Number(tx.timeBounds?.maxTime);
    expect(maxTime).toBeGreaterThan(0);
    expect(maxTime - Math.floor(Date.now() / 1000)).toBeLessThanOrEqual(181);
  });

  it("rejects a malformed recipient before spending a Horizon round-trip", async () => {
    const { buildSendTransaction } = await importStellar();
    await expect(
      buildSendTransaction({ ...baseParams, recipientAddress: "not-a-stellar-address" })
    ).rejects.toThrow("Invalid recipient address");
    expect(mockServer.loadAccount).not.toHaveBeenCalled();
  });

  it("rejects a send the source account cannot cover", async () => {
    mockServer.loadAccount.mockResolvedValue(
      accountWithBalances([{ asset_type: "native", balance: "10.0000000" }])
    );
    const { buildSendTransaction } = await importStellar();
    await expect(
      buildSendTransaction({ ...baseParams, fromAmount: "50" })
    ).rejects.toThrow("Insufficient balance: have 10 XLM, need 50 XLM");
  });

  it("treats a missing trustline for the send asset as a zero balance", async () => {
    process.env.STELLAR_USDC_ISSUER = USDC_ISSUER;
    mockServer.loadAccount.mockResolvedValue(
      accountWithBalances([{ asset_type: "native", balance: "100.0000000" }])
    );
    const { buildSendTransaction } = await importStellar();
    await expect(
      buildSendTransaction({ ...baseParams, fromAsset: "USDC", fromAmount: "5" })
    ).rejects.toThrow("Insufficient balance: have 0 USDC");
  });

  it("resolves a configured non-native asset from STELLAR_<CODE>_ISSUER", async () => {
    process.env.STELLAR_USDC_ISSUER = USDC_ISSUER;
    mockServer.loadAccount.mockResolvedValue(
      accountWithBalances([
        { asset_type: "credit_alphanum4", asset_code: "USDC", balance: "500.0000000" },
      ])
    );

    const { buildSendTransaction } = await importStellar();
    const xdr = await buildSendTransaction({
      ...baseParams,
      fromAsset: "usdc", // lower-case on purpose: resolveAsset upper-cases
      toAsset: "USDC",
      fromAmount: "25",
      toAmount: "25",
    });

    const tx = TransactionBuilder.fromXDR(xdr, Networks.TESTNET);
    const op = tx.operations[0] as Operation.PathPaymentStrictSend;
    expect(op.sendAsset).toEqual(new Asset("USDC", USDC_ISSUER));
    expect(op.destAsset).toEqual(new Asset("USDC", USDC_ISSUER));
    expect(op.destMin).toBe("24.7500000");
  });

  it("fails with an actionable error for an asset with no configured issuer", async () => {
    mockServer.loadAccount.mockResolvedValue(
      accountWithBalances([{ asset_type: "native", balance: "100.0000000" }])
    );
    const { buildSendTransaction } = await importStellar();
    await expect(
      buildSendTransaction({ ...baseParams, toAsset: "NGNT" })
    ).rejects.toThrow("STELLAR_NGNT_ISSUER");
  });

  it("rejects a configured issuer that is not a valid Stellar public key", async () => {
    process.env.STELLAR_NGNT_ISSUER = "not-a-public-key";
    mockServer.loadAccount.mockResolvedValue(
      accountWithBalances([{ asset_type: "native", balance: "100.0000000" }])
    );
    const { buildSendTransaction } = await importStellar();
    await expect(
      buildSendTransaction({ ...baseParams, toAsset: "NGNT" })
    ).rejects.toThrow("STELLAR_NGNT_ISSUER is not a valid Stellar public key.");
  });
});

describe("submitTransaction", () => {
  function signedXdr(): string {
    const keypair = Keypair.random();
    const tx = new TransactionBuilder(new Account(keypair.publicKey(), "1234"), {
      fee: BASE_FEE,
      networkPassphrase: Networks.TESTNET,
    })
      .addOperation(
        Operation.payment({
          destination: RECIPIENT,
          asset: Asset.native(),
          amount: "1",
        })
      )
      .setTimeout(180)
      .build();
    tx.sign(keypair);
    return tx.toXDR();
  }

  it("returns the Horizon hash on success", async () => {
    mockServer.submitTransaction.mockResolvedValue({ hash: "abc123" });
    const { submitTransaction } = await importStellar();

    await expect(submitTransaction(signedXdr())).resolves.toEqual({
      hash: "abc123",
      status: "confirmed",
    });
    expect(mockServer.submitTransaction).toHaveBeenCalledTimes(1);
  });

  it("surfaces Horizon result_codes instead of throwing", async () => {
    const resultCodes = { transaction: "tx_failed", operations: ["op_underfunded"] };
    mockServer.submitTransaction.mockRejectedValue({
      response: { data: { extras: { result_codes: resultCodes } } },
    });
    const { submitTransaction } = await importStellar();

    await expect(submitTransaction(signedXdr())).resolves.toEqual({
      hash: "",
      status: "failed",
      resultCode: JSON.stringify(resultCodes),
    });
  });

  it("falls back to unknown_error when Horizon gives no result_codes", async () => {
    mockServer.submitTransaction.mockRejectedValue(new Error("socket hang up"));
    const { submitTransaction } = await importStellar();

    await expect(submitTransaction(signedXdr())).resolves.toEqual({
      hash: "",
      status: "failed",
      resultCode: "unknown_error",
    });
  });

  it("rejects an XDR that is not parseable at all", async () => {
    const { submitTransaction } = await importStellar();
    await expect(submitTransaction("definitely-not-xdr")).rejects.toThrow();
    expect(mockServer.submitTransaction).not.toHaveBeenCalled();
  });
});
