import {
  Networks,
  Horizon,
  Asset,
  Operation,
  TransactionBuilder,
} from "@stellar/stellar-sdk";
import { getRate } from "@/lib/rates";
import { toStroops } from "@/lib/amounts";
import { withTimeout } from "@/lib/http";
import type { HorizonPathRecord } from "@/lib/routing";

const NETWORK = process.env.STELLAR_NETWORK || "testnet";
export const HORIZON_URL = process.env.STELLAR_HORIZON_URL || "https://horizon-testnet.stellar.org";
export const NETWORK_PASSPHRASE = NETWORK === "testnet" ? Networks.TESTNET : Networks.PUBLIC;
export const EXPLORER_BASE =
  NETWORK === "testnet" ? "https://stellar.expert/explorer/testnet" : "https://stellar.expert/explorer/public";
const HORIZON_TIMEOUT_MS = 8000;

export const server = new Horizon.Server(HORIZON_URL);

const STELLAR_PUBKEY_RE = /^G[A-Z2-7]{55}$/;

/** Resolve a currency/asset code to a Stellar Asset. XLM is native; every
 * other asset needs its issuer's public key set as STELLAR_<CODE>_ISSUER.
 * An unconfigured asset fails loudly instead of using a placeholder issuer. */
export function resolveAsset(code: string): Asset {
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

/** Ask Friendbot to fund a testnet account. Testnet only; the server never
 * creates or holds keys, the wallet owns the key. */
export async function fundTestnetAccount(publicKey: string): Promise<{ funded: boolean; reason?: string }> {
  if (NETWORK !== "testnet") return { funded: false, reason: "Friendbot is only available on testnet" };
  try {
    const res = await withTimeout(
      fetch(`https://friendbot.stellar.org?addr=${encodeURIComponent(publicKey)}`),
      HORIZON_TIMEOUT_MS,
      "Friendbot"
    );
    if (res.ok) return { funded: true };
    // Friendbot answers 400 when the account already exists.
    return { funded: false, reason: res.status === 400 ? "Account is already funded" : `Friendbot responded ${res.status}` };
  } catch (err) {
    return { funded: false, reason: err instanceof Error ? err.message : "Friendbot unreachable" };
  }
}

/** Reference fiat rate for display only. Never used to price a transfer: the
 * receive amount of a transfer always comes from Horizon path finding. */
export async function fetchRate(from: string, to: string): Promise<string> {
  const result = await getRate(from, to);
  return result.rate;
}

/** Real balances from Horizon. Returns [] if the account isn't funded yet. */
export async function getAccountBalances(publicKey: string): Promise<
  Array<{ asset: string; balance: string }>
> {
  try {
    const account = await withTimeout(server.loadAccount(publicKey), HORIZON_TIMEOUT_MS, "Horizon account lookup");
    return account.balances.map((b) => {
      const asset = b.asset_type === "native" ? "XLM" : (b as { asset_code: string }).asset_code;
      return { asset, balance: b.balance };
    });
  } catch (err: unknown) {
    const status = (err as { response?: { status?: number } })?.response?.status;
    if (status === 404) return [];
    throw err;
  }
}

/** Latest ledger + base fee, for a lightweight network-status widget */
export async function getNetworkStatus(): Promise<{
  ledgerSequence: number;
  baseFeeStroops: number;
  closedAt: string;
}> {
  const ledgers = await withTimeout(
    server.ledgers().order("desc").limit(1).call(),
    HORIZON_TIMEOUT_MS,
    "Horizon ledger lookup"
  );
  const latest = ledgers.records[0];
  return {
    ledgerSequence: latest.sequence,
    baseFeeStroops: latest.base_fee_in_stroops,
    closedAt: latest.closed_at,
  };
}

/** Build an unsigned path_payment_strict_send transaction (XDR) for the wallet to sign. */
export async function buildSendTransaction(params: {
  sourcePublicKey: string;
  fromAsset: string;
  toAsset: string;
  fromAmount: string;
  /** Minimum the recipient must receive; the transaction fails on-chain below this. */
  destMin: string;
  recipientAddress: string;
  path?: HorizonPathRecord["path"];
  feeStroops?: number;
}): Promise<string> {
  const { sourcePublicKey, fromAsset, toAsset, fromAmount, destMin, recipientAddress } = params;

  if (!STELLAR_PUBKEY_RE.test(recipientAddress)) throw new Error("Invalid recipient address");

  const sendAsset = resolveAsset(fromAsset);
  const destAsset = resolveAsset(toAsset);
  const path = (params.path ?? []).map((p) =>
    p.asset_type === "native" ? Asset.native() : new Asset(p.asset_code as string, p.asset_issuer as string)
  );

  const account = await withTimeout(server.loadAccount(sourcePublicKey), HORIZON_TIMEOUT_MS, "Horizon account lookup");

  const entry = account.balances.find((b) =>
    sendAsset.isNative()
      ? b.asset_type === "native"
      : (b as { asset_code?: string; asset_issuer?: string }).asset_code === sendAsset.getCode() &&
        (b as { asset_issuer?: string }).asset_issuer === sendAsset.getIssuer()
  );
  const available = entry ? toStroops(entry.balance) : BigInt(0);
  if (available < toStroops(fromAmount)) {
    throw new Error(`Insufficient balance: have ${entry?.balance ?? "0"} ${fromAsset}, need ${fromAmount} ${fromAsset}`);
  }

  return new TransactionBuilder(account, {
    fee: String(params.feeStroops ?? 100),
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(
      Operation.pathPaymentStrictSend({
        sendAsset,
        sendAmount: fromAmount,
        destination: recipientAddress,
        destAsset,
        destMin,
        path,
      })
    )
    .setTimeout(180)
    .build()
    .toXDR();
}

/** Submit a signed XDR to Horizon */
export async function submitTransaction(signedXdr: string): Promise<{
  hash: string;
  status: "confirmed" | "failed";
  resultCode?: string;
}> {
  const transaction = TransactionBuilder.fromXDR(signedXdr, NETWORK_PASSPHRASE);
  try {
    const result = await withTimeout(server.submitTransaction(transaction), 30_000, "Horizon submit");
    return { hash: result.hash, status: "confirmed" };
  } catch (err: unknown) {
    const extras = (err as { response?: { data?: { extras?: { result_codes?: unknown } } } })?.response?.data?.extras
      ?.result_codes;
    console.error("[submitTransaction] Horizon rejected the transaction:", extras ?? (err as Error).message);
    return { hash: "", status: "failed", resultCode: extras ? JSON.stringify(extras) : "unknown_error" };
  }
}
