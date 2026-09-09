import { describe, it, expect } from "vitest";
import { buildSeedUsers, SEED_RATES } from "../seed";
import { isValidStellarPublicKey } from "@/lib/stellar-address";
import { KycStatus } from "../../src/generated/prisma/enums";

// These check the SHAPE of the seed data (no live database needed) - the
// actual insert path is exercised by running `npx prisma db seed` against
// a real Postgres instance, which is how this was verified manually (see
// the PR description). buildSeedUsers()/SEED_RATES are exported from
// seed.ts specifically so these can run without a DB connection.

describe("buildSeedUsers", () => {
  it("returns a non-empty list with unique emails", () => {
    const users = buildSeedUsers();
    expect(users.length).toBeGreaterThan(0);
    const emails = users.map((u) => u.email);
    expect(new Set(emails).size).toBe(emails.length);
  });

  it("gives every user a valid, non-placeholder email address", () => {
    for (const user of buildSeedUsers()) {
      expect(user.email).toMatch(/^[^\s@]+@[^\s@]+\.[^\s@]+$/);
    }
  });

  it("only uses real KycStatus enum values", () => {
    const validStatuses = Object.values(KycStatus);
    for (const user of buildSeedUsers()) {
      expect(validStatuses).toContain(user.kycStatus);
    }
  });

  it("generates a checksum-valid Stellar public key for every user that has one", () => {
    const usersWithKeys = buildSeedUsers().filter((u) => u.stellarPublicKey !== null);
    // At least one seeded user should exercise the "has a linked Stellar
    // account" case - if this list goes empty, that coverage silently
    // disappears.
    expect(usersWithKeys.length).toBeGreaterThan(0);
    for (const user of usersWithKeys) {
      expect(isValidStellarPublicKey(user.stellarPublicKey as string)).toBe(true);
    }
  });

  it("covers more than one KycStatus value (not every seeded user stuck at the same stage)", () => {
    const statuses = new Set(buildSeedUsers().map((u) => u.kycStatus));
    expect(statuses.size).toBeGreaterThan(1);
  });
});

describe("SEED_RATES", () => {
  it("has no duplicate fromAsset/toAsset pairs (Rate has a compound @@unique on them)", () => {
    const keys = SEED_RATES.map((r) => `${r.fromAsset}:${r.toAsset}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("uses upper-case asset/currency codes, matching the convention rates.ts normalizes to", () => {
    for (const r of SEED_RATES) {
      expect(r.fromAsset).toBe(r.fromAsset.toUpperCase());
      expect(r.toAsset).toBe(r.toAsset.toUpperCase());
    }
  });

  it("stores every rate as a parseable positive number (rates are strings, not floats, by design)", () => {
    for (const r of SEED_RATES) {
      const parsed = Number(r.rate);
      expect(Number.isFinite(parsed)).toBe(true);
      expect(parsed).toBeGreaterThan(0);
    }
  });
});
