import { describe, it, expect, vi, afterEach } from "vitest";
import { Keypair } from "@stellar/stellar-sdk";
import {
  isStellarPublicKey,
  stellarPublicKeySchema,
  stellarAmountSchema,
  stellarSendSchema,
} from "@/lib/validations";

/** A real key with one character flipped: the shape regex still matches, but
 * the trailing CRC16 checksum no longer does. */
function corrupt(publicKey: string): string {
  const last = publicKey.slice(-1);
  return publicKey.slice(0, -1) + (last === "A" ? "B" : "A");
}

const VALID_KEY = Keypair.random().publicKey();
const TYPO_KEY = corrupt(VALID_KEY);

describe("isStellarPublicKey", () => {
  it("accepts a real Stellar public key", () => {
    expect(isStellarPublicKey(VALID_KEY)).toBe(true);
  });

  it("rejects a key whose shape is right but whose checksum is not", () => {
    expect(TYPO_KEY).toMatch(/^G[A-Z2-7]{55}$/);
    expect(isStellarPublicKey(TYPO_KEY)).toBe(false);
  });

  it("rejects secret keys, muxed addresses and other non-G strings", () => {
    expect(isStellarPublicKey(Keypair.random().secret())).toBe(false);
    expect(isStellarPublicKey(VALID_KEY.toLowerCase())).toBe(false);
    expect(isStellarPublicKey(VALID_KEY.slice(0, -1))).toBe(false);
    expect(isStellarPublicKey("")).toBe(false);
  });
});

describe("stellarPublicKeySchema", () => {
  it("accepts a valid key", () => {
    expect(stellarPublicKeySchema.safeParse(VALID_KEY).success).toBe(true);
  });

  it("reports a checksum failure distinctly from a shape failure", () => {
    const typo = stellarPublicKeySchema.safeParse(TYPO_KEY);
    expect(typo.success).toBe(false);
    if (!typo.success) expect(typo.error.errors[0].message).toMatch(/checksum/i);

    const shape = stellarPublicKeySchema.safeParse("not-a-key");
    expect(shape.success).toBe(false);
    if (!shape.success) expect(shape.error.errors[0].message).toBe("Invalid Stellar public key");
  });
});

describe("stellarAmountSchema", () => {
  it("accepts amounts within Stellar's 7-decimal precision", () => {
    for (const amount of ["1", "100.50", "0.0000001", "12345.1234567"]) {
      expect(stellarAmountSchema.safeParse(amount).success).toBe(true);
    }
  });

  it("rejects more than 7 decimal places", () => {
    const result = stellarAmountSchema.safeParse("1.12345678");
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.errors[0].message).toMatch(/7 decimal places/);
  });

  it("rejects zero and non-numeric input", () => {
    expect(stellarAmountSchema.safeParse("0").success).toBe(false);
    expect(stellarAmountSchema.safeParse("0.0").success).toBe(false);
    expect(stellarAmountSchema.safeParse("-5").success).toBe(false);
    expect(stellarAmountSchema.safeParse("1e3").success).toBe(false);
    expect(stellarAmountSchema.safeParse("abc").success).toBe(false);
  });
});

describe("stellarSendSchema", () => {
  const base = { fromAsset: "XLM", toAsset: "USDC", amount: "10" };

  it("accepts a well-formed send request", () => {
    expect(stellarSendSchema.safeParse({ ...base, recipientAddress: VALID_KEY }).success).toBe(true);
  });

  it("rejects a typo'd recipient before the request reaches Horizon", () => {
    expect(stellarSendSchema.safeParse({ ...base, recipientAddress: TYPO_KEY }).success).toBe(false);
  });

  it("rejects an over-precise amount", () => {
    expect(
      stellarSendSchema.safeParse({ ...base, amount: "1.12345678", recipientAddress: VALID_KEY })
        .success
    ).toBe(false);
  });
});

describe("buildSendTransaction input guards", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("rejects a checksum-invalid recipient without calling Horizon", async () => {
    const stellar = await import("@/lib/stellar");
    const loadAccount = vi.spyOn(stellar.server, "loadAccount");

    await expect(
      stellar.buildSendTransaction({
        sourcePublicKey: VALID_KEY,
        fromAsset: "XLM",
        toAsset: "XLM",
        fromAmount: "10",
        toAmount: "10",
        recipientAddress: TYPO_KEY,
      })
    ).rejects.toThrow("Invalid recipient address");

    expect(loadAccount).not.toHaveBeenCalled();
  });

  it("rejects an over-precise amount without calling Horizon", async () => {
    const stellar = await import("@/lib/stellar");
    const loadAccount = vi.spyOn(stellar.server, "loadAccount");

    await expect(
      stellar.buildSendTransaction({
        sourcePublicKey: VALID_KEY,
        fromAsset: "XLM",
        toAsset: "XLM",
        fromAmount: "1.12345678",
        toAmount: "10",
        recipientAddress: VALID_KEY,
      })
    ).rejects.toThrow(/Invalid amount/);

    expect(loadAccount).not.toHaveBeenCalled();
  });
});
