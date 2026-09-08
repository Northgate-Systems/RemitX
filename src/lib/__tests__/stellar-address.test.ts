import { describe, it, expect } from "vitest";
import { Keypair, StrKey } from "@stellar/stellar-sdk";
import {
  checkStellarPublicKey,
  isValidStellarPublicKey,
  STELLAR_PUBLIC_KEY_LENGTH,
} from "@/lib/stellar-address";
import { stellarSendSchema } from "@/lib/validations";

/** A well-known valid testnet address, hard-coded so these tests still pin a
 * concrete expectation even if the SDK were swapped out. */
const VALID = "GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN7";

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/** Flip exactly one character of `address` at `index` to a different, still
 * legal base32 character — i.e. simulate a single-character typo. */
function typo(address: string, index: number): string {
  const current = address[index];
  const replacement = BASE32[(BASE32.indexOf(current) + 1) % BASE32.length];
  return address.slice(0, index) + replacement + address.slice(index + 1);
}

describe("checkStellarPublicKey", () => {
  it("accepts a real Stellar public key", () => {
    expect(checkStellarPublicKey(VALID)).toEqual({ valid: true });
    expect(VALID).toHaveLength(STELLAR_PUBLIC_KEY_LENGTH);
  });

  it("accepts freshly generated keypairs and agrees with the Stellar SDK", () => {
    for (let i = 0; i < 200; i++) {
      const publicKey = Keypair.random().publicKey();
      expect(isValidStellarPublicKey(publicKey)).toBe(
        StrKey.isValidEd25519PublicKey(publicKey)
      );
      expect(isValidStellarPublicKey(publicKey)).toBe(true);
    }
  });

  it("rejects every single-character typo, at every position, like the SDK does", () => {
    // This is the whole point of the issue: a typo'd address still matches
    // /^G[A-Z2-7]{55}$/, so only the checksum catches it.
    for (let index = 1; index < STELLAR_PUBLIC_KEY_LENGTH; index++) {
      const mistyped = typo(VALID, index);
      expect(/^G[A-Z2-7]{55}$/.test(mistyped)).toBe(true); // passes the old regex
      expect(isValidStellarPublicKey(mistyped)).toBe(false); // but not the checksum
      expect(StrKey.isValidEd25519PublicKey(mistyped)).toBe(false);
      expect(checkStellarPublicKey(mistyped).problem).toBe("checksum");
    }
  });

  it("rejects two addresses swapped at a character pair (transposition)", () => {
    const transposed = VALID.slice(0, 10) + VALID[11] + VALID[10] + VALID.slice(12);
    expect(transposed).not.toBe(VALID);
    expect(isValidStellarPublicKey(transposed)).toBe(false);
    expect(StrKey.isValidEd25519PublicKey(transposed)).toBe(false);
  });

  it("reports a truncated paste as too short, not as a bad checksum", () => {
    const truncated = VALID.slice(0, 40);
    expect(checkStellarPublicKey(truncated).problem).toBe("too-short");
    expect(checkStellarPublicKey(truncated).message).toContain("40 characters");
  });

  it("reports an over-long paste as too long", () => {
    expect(checkStellarPublicKey(VALID + "A").problem).toBe("too-long");
  });

  it("rejects a secret key pasted into the recipient field with a clear message", () => {
    const secret = Keypair.random().secret();
    const result = checkStellarPublicKey(secret);
    expect(result.valid).toBe(false);
    expect(result.problem).toBe("prefix");
    expect(result.message).toContain("Secret keys");
  });

  it("rejects characters outside the base32 alphabet", () => {
    // 0, 1, 8, 9 and lowercase are not in RFC 4648 base32.
    const withZero = "G0" + VALID.slice(2);
    expect(checkStellarPublicKey(withZero).problem).toBe("charset");
    expect(checkStellarPublicKey(VALID.toLowerCase()).valid).toBe(false);
  });

  it("treats an empty or whitespace-only value as empty, not malformed", () => {
    expect(checkStellarPublicKey("").problem).toBe("empty");
    expect(checkStellarPublicKey("   ").problem).toBe("empty");
  });

  it("tolerates surrounding whitespace from a copy-paste", () => {
    expect(isValidStellarPublicKey(`  ${VALID}\n`)).toBe(true);
  });

  it("rejects a muxed (M...) address, which this flow doesn't support", () => {
    const muxed = StrKey.encodeMed25519PublicKey(
      Buffer.concat([StrKey.decodeEd25519PublicKey(VALID), Buffer.alloc(8)])
    );
    expect(muxed.startsWith("M")).toBe(true);
    expect(isValidStellarPublicKey(muxed)).toBe(false);
  });
});

describe("stellarSendSchema", () => {
  const base = { fromAsset: "USD", toAsset: "NGN", amount: "100.00" };

  it("accepts a checksum-valid recipient", () => {
    expect(stellarSendSchema.safeParse({ ...base, recipientAddress: VALID }).success).toBe(true);
  });

  it("rejects a typo'd recipient that still matches the old regex", () => {
    const mistyped = typo(VALID, 30);
    expect(/^G[A-Z2-7]{55}$/.test(mistyped)).toBe(true);
    const result = stellarSendSchema.safeParse({ ...base, recipientAddress: mistyped });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toContain("checksum");
  });
});
