import {
  Networks,
  Keypair,
  Horizon,
  Asset,
  Operation,
  TransactionBuilder,
  BASE_FEE,
} from "@stellar/stellar-sdk";
import { getRate } from "@/lib/rates";

const NETWORK = process.env.STELLAR_NETWORK || "testnet";
export const HORIZON_URL = process.env.STELLAR_HORIZON_URL || "https://horizon-testnet.stellar.org";
export const NETWORK_PASSPHRASE = NETWORK === "testnet" ? Networks.TESTNET : Networks.PUBLIC;

export const server = new Horizon.Server(HORIZON_URL);

// ---------------------------------------------------------------------------
// Stellar Integration
//
// Real Horizon calls throughout. The one thing that can't be invented here:
// non-native assets (USDC, NGNT, etc.) need a real issuing account, which
// only exists once you've picked real anchors. Configure issuers via env
// (STELLAR_<CODE>_ISSUER) as corridors go live - resolveAsset() below throws
// a clear, actionable error for any asset that isn't configured yet, rather
// than silently using a fake issuer.
// ---------------------------------------------------------------------------

const STELLAR_PUBKEY_RE = /^G[A-Z2-7]{55}$/;

/** Resolve a currency/asset code to a Stellar Asset. XLM is native; every
 * other asset needs its issuer's public key set as STELLAR_<CODE>_ISSUER. */
function resolveAsset(code: string): Asset {
  const upper = code.toUpperCase();
  if (upper === "XLM") return Asset.native();

  const envKey = `STELLAR_${upper}_ISSUER`;
  const issuer = process.env[envKey];
  if (!issuer) {
    throw new Error(
      `No configured Stellar issuer for asset ${upper}. Set ${envKey} in .env to the anchor's issuing account before this corridor can go live.`
    );
  }
  if (!STELLAR_PUBKEY_RE.test(issuer)) {
    throw new Error(`${envKey} is not a valid Stellar public key.`);
  }
  return new Asset(upper, issuer);
}

/** Generate a new Stellar keypair and fund via Friendbot (testnet only) */
export async function createTestnetAccount(): Promise<{
  publicKey: string;
  secretKey: string;
}> {
  const keypair = Keypair.random();
  const publicKey = keypair.publicKey();
  const secretKey = keypair.secret();

  if (NETWORK === "testnet") {
    const friendbotUrl = `https://friendbot.stellar.org?addr=${publicKey}`;
    try {
      const response = await fetch(friendbotUrl, { method: "GET" });
      if (!response.ok) {
        const body = await response.text();
        console.warn(`[createTestnetAccount] Friendbot responded with ${response.status}: ${body}`);
      }
    } catch (err) {
      console.warn(`[createTestnetAccount] Friendbot request failed:`, err);
    }
  }

  return { publicKey, secretKey };
}

/** Fetch a live rate for fromAsset -> toAsset (real free-API rate engine, see lib/rates.ts) */
export async function fetchRate(from: string, to: string): Promise<string> {
  const result = await getRate(from, to);
  return result.rate;
}

/** Get an account's real balances from Horizon. Returns [] if the account
 * doesn't exist on-chain yet (unfunded). */
export async function getAccountBalances(publicKey: string): Promise<
  Array<{ asset: string; balance: string }>
> {
  try {
    const account = await server.loadAccount(publicKey);
    return account.balances.map((b) => {
      const asset =
        b.asset_type === "native"
          ? "XLM"
          : (b as { asset_code: string }).asset_code;
      return { asset, balance: b.balance };
    });
  } catch (err: unknown) {
    const status = (err as { response?: { status?: number } })?.response?.status;
    if (status === 404) return []; // unfunded / doesn't exist yet
    throw err;
  }
}

/** Latest ledger + base fee, for a lightweight network-status widget */
export async function getNetworkStatus(): Promise<{
  ledgerSequence: number;
  baseFeeStroops: number;
  closedAt: string;
}> {
  const ledgers = await server.ledgers().order("desc").limit(1).call();
  const latest = ledgers.records[0];
  return {
    ledgerSequence: latest.sequence,
    baseFeeStroops: latest.base_fee_in_stroops,
    closedAt: latest.closed_at,
  };
}

export interface FeeEstimate {
  /** Network minimum per operation, in stroops - what a transaction pays
   * when there's no congestion. */
  baseFeeStroops: number;
  /** A sane default to pre-fill in the UI: the median fee actually being
   * charged right now, floored at the base fee so it's never lower. */
  recommendedFeeStroops: number;
  /** True once the median charged fee rises above the flat network
   * minimum - i.e. the ledger is full enough that submitters are bidding
   * fees up to get included. */
  isSurgePricing: boolean;
  /** How full the last closed ledger's operation capacity was, 0-100. */
  ledgerCapacityUsagePct: number;
  /** Fee-charged percentiles (stroops) from Horizon's rolling fee stats,
   * for callers that want to show "pay this much to land in N seconds"
   * instead of just one recommended number. */
  percentiles: {
    p10: number;
    p20: number;
    p30: number;
    p40: number;
    p50: number;
    p60: number;
    p70: number;
    p80: number;
    p90: number;
    p95: number;
    p99: number;
  };
}

/** Current network fee estimate, including surge-pricing detection, for
 * showing an accurate "here's what this will cost" before the user
 * confirms a send instead of a hardcoded BASE_FEE. */
export async function getFeeEstimate(): Promise<FeeEstimate> {
  const stats = await server.feeStats();
  const toInt = (s: string) => parseInt(s, 10);
  const charged = stats.fee_charged;
  const percentiles = {
    p10: toInt(charged.p10),
    p20: toInt(charged.p20),
    p30: toInt(charged.p30),
    p40: toInt(charged.p40),
    p50: toInt(charged.p50),
    p60: toInt(charged.p60),
    p70: toInt(charged.p70),
    p80: toInt(charged.p80),
    p90: toInt(charged.p90),
    p95: toInt(charged.p95),
    p99: toInt(charged.p99),
  };
  const baseFeeStroops = toInt(BASE_FEE);
  const ledgerCapacityUsagePct = Math.round(
    parseFloat(stats.ledger_capacity_usage) * 100
  );

  return {
    baseFeeStroops,
    recommendedFeeStroops: Math.max(percentiles.p50, baseFeeStroops),
    isSurgePricing: percentiles.p50 > baseFeeStroops,
    ledgerCapacityUsagePct,
    percentiles,
  };
}

/** Build a path_payment_strict_send transaction and return unsigned XDR */
export async function buildSendTransaction(params: {
  sourcePublicKey: string;
  fromAsset: string;
  toAsset: string;
  fromAmount: string;
  toAmount: string;
  recipientAddress: string;
}): Promise<string> {
  const { sourcePublicKey, fromAsset, toAsset, fromAmount, toAmount, recipientAddress } = params;

  if (!STELLAR_PUBKEY_RE.test(recipientAddress)) {
    throw new Error("Invalid recipient address");
  }

  const sendAsset = resolveAsset(fromAsset);
  const destAsset = resolveAsset(toAsset);

  const account = await server.loadAccount(sourcePublicKey);

  // Check the source actually holds enough of the send asset before
  // building a transaction that Horizon will reject anyway.
  const balanceEntry = account.balances.find((b) =>
    sendAsset.isNative()
      ? b.asset_type === "native"
      : (b as { asset_code?: string }).asset_code === sendAsset.getCode()
  );
  const available = balanceEntry ? parseFloat(balanceEntry.balance) : 0;
  if (available < parseFloat(fromAmount)) {
    throw new Error(
      `Insufficient balance: have ${available} ${fromAsset}, need ${fromAmount} ${fromAsset}`
    );
  }

  // 1% slippage tolerance on the destination minimum
  const destMin = (parseFloat(toAmount) * 0.99).toFixed(7);

  const transaction = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(
      Operation.pathPaymentStrictSend({
        sendAsset,
        sendAmount: fromAmount,
        destination: recipientAddress,
        destAsset,
        destMin,
      })
    )
    .setTimeout(180)
    .build();

  return transaction.toXDR();
}

/** Submit a signed XDR to Horizon */
export async function submitTransaction(signedXdr: string): Promise<{
  hash: string;
  status: "confirmed" | "failed";
  resultCode?: string;
}> {
  const transaction = TransactionBuilder.fromXDR(signedXdr, NETWORK_PASSPHRASE);

  try {
    const result = await server.submitTransaction(transaction);
    return { hash: result.hash, status: "confirmed" };
  } catch (err: unknown) {
    const extras = (err as {
      response?: { data?: { extras?: { result_codes?: unknown } } };
    })?.response?.data?.extras?.result_codes;
    console.error("[submitTransaction] Horizon rejected the transaction:", extras ?? err);
    return {
      hash: "",
      status: "failed",
      resultCode: extras ? JSON.stringify(extras) : "unknown_error",
    };
  }
}
