import { describe, it, expect } from "vitest";
import { Account, Asset, Keypair, Networks, Operation, TransactionBuilder } from "@stellar/stellar-sdk";
import { assertSignedXdrMatches, TxMismatchError } from "../tx-guard";

const source = Keypair.random();
const recipient = Keypair.random().publicKey();
const issuer = Keypair.random().publicKey();
const usdcAsset = new Asset("USDC", issuer);
const passphrase = Networks.TESTNET;

function build(
  opts: {
    sendAsset?: Asset;
    destAsset?: Asset;
    sendAmount?: string;
    destMin?: string;
    destination?: string;
    opSource?: string;
    signer?: Keypair;
    ops?: number;
  } = {}
) {
  const b = new TransactionBuilder(new Account(source.publicKey(), "1"), {
    fee: "100",
    networkPassphrase: passphrase,
  });
  for (let i = 0; i < (opts.ops ?? 1); i++) {
    b.addOperation(
      Operation.pathPaymentStrictSend({
        sendAsset: opts.sendAsset ?? Asset.native(),
        sendAmount: opts.sendAmount ?? "10",
        destination: opts.destination ?? recipient,
        destAsset: opts.destAsset ?? usdcAsset,
        destMin: opts.destMin ?? "9.5",
        source: opts.opSource,
      })
    );
  }
  const tx = b.setTimeout(60).build();
  const unsignedTxHash = tx.hash().toString("hex");
  if (opts.signer ?? source) tx.sign(opts.signer ?? source);
  return { xdr: tx.toXDR(), unsignedTxHash };
}

const baseExpected = {
  source: source.publicKey(),
  recipient,
  fromAmount: "10",
  fromAsset: Asset.native(),
  toAsset: usdcAsset,
  destMin: "9.5",
  networkPassphrase: passphrase,
};

describe("assertSignedXdrMatches", () => {
  it("accepts the transfer we created, signed by its owner", () => {
    const { xdr, unsignedTxHash } = build();
    expect(() => assertSignedXdrMatches(xdr, { ...baseExpected, unsignedTxHash })).not.toThrow();
  });

  it("rejects a different recipient", () => {
    const { xdr } = build({ destination: Keypair.random().publicKey() });
    expect(() => assertSignedXdrMatches(xdr, baseExpected)).toThrow(TxMismatchError);
  });

  it("rejects a different amount", () => {
    const { xdr } = build({ sendAmount: "11" });
    expect(() => assertSignedXdrMatches(xdr, baseExpected)).toThrow(/Amount/);
  });

  it("rejects a swapped sendAsset", () => {
    const { xdr } = build({ sendAsset: usdcAsset });
    expect(() => assertSignedXdrMatches(xdr, baseExpected)).toThrow(/Send asset/);
  });

  it("rejects a swapped destAsset", () => {
    const { xdr } = build({ destAsset: Asset.native() });
    expect(() => assertSignedXdrMatches(xdr, baseExpected)).toThrow(/Destination asset/);
  });

  it("rejects a lowered destMin below the expected floor", () => {
    const { xdr } = build({ destMin: "0.0000001" });
    expect(() => assertSignedXdrMatches(xdr, baseExpected)).toThrow(/Minimum destination amount/);
  });

  it("rejects an operation-level source override", () => {
    const { xdr } = build({ opSource: Keypair.random().publicKey() });
    expect(() => assertSignedXdrMatches(xdr, baseExpected)).toThrow(/Operation source/);
  });

  it("rejects a transaction whose hash differs from the stored unsignedTxHash", () => {
    const { xdr } = build();
    const other = build({ destMin: "9.6" });
    expect(() =>
      assertSignedXdrMatches(xdr, { ...baseExpected, unsignedTxHash: other.unsignedTxHash })
    ).toThrow(/hash does not match/);
  });

  it("rejects a transaction signed by someone else", () => {
    const { xdr } = build({ signer: Keypair.random() });
    expect(() => assertSignedXdrMatches(xdr, baseExpected)).toThrow(/not signed/);
  });

  it("rejects multi-operation transactions", () => {
    const { xdr } = build({ ops: 2 });
    expect(() => assertSignedXdrMatches(xdr, baseExpected)).toThrow(/exactly one/);
  });

  it("rejects unparseable input", () => {
    expect(() => assertSignedXdrMatches("garbage", baseExpected)).toThrow(TxMismatchError);
  });
});
