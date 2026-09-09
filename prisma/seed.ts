/**
 * Local development seed data.
 *
 * Populates a small, realistic dataset (users at every KYC stage, a set of
 * cached rates matching the pairs `refreshAllRates()` maintains, and a
 * couple of transactions - one plain, one that went through escrow) so a
 * new contributor can `npm run dev` and immediately have something to look
 * at on the dashboard, activity, and anchors pages without hand-creating
 * accounts first.
 *
 * Safe to re-run: every insert is an `upsert` (or an existence check, for
 * models without a natural unique key to upsert on) keyed on something
 * stable, so running this twice updates the same rows instead of piling up
 * duplicates.
 *
 * Usage: `npx prisma db seed` (wired up via `migrations.seed` in
 * prisma.config.ts) or `npx tsx prisma/seed.ts` directly. Requires
 * DATABASE_URL to point at a real (local or Supabase) Postgres instance
 * with the schema already pushed/migrated (`npx prisma db push`).
 *
 * 🔴 User rows are inserted via raw SQL, not `db.user.create()`/`upsert()` -
 * see `upsertUser()` below for why.
 */
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { KycStatus, TransactionStatus, EscrowStatus } from "../src/generated/prisma/enums";
import { Keypair } from "@stellar/stellar-sdk";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const db = new PrismaClient({ adapter });

// Fixed dev-only password for every seeded user - never used outside this
// seed. bcrypt cost kept low (4 instead of the app's real 12) purely so
// re-seeding stays fast; this only ever runs against local/dev databases.
const DEV_PASSWORD_HASH = bcrypt.hashSync("devpassword123", 4);

/**
 * Insert-or-update a User by email, via raw parameterized SQL.
 *
 * Why not `db.user.upsert()`: on prisma@7.8.0 (pinned in package.json),
 * `db.user.create()`/`upsert()` throws `PrismaClientValidationError:
 * Unknown argument '<some scalar field>'` for *any* payload, even one that
 * supplies every field exactly as typed - reproduced with `firstName`,
 * `lastName`, and other fields getting flagged depending on object key
 * order, which means it's a positional-matching bug in the query
 * validator, not a real schema mismatch. Isolated the trigger: it's
 * specific to models that declare a one-to-many *list* relation field
 * (`User.transactions Transaction[]`, `User.escrows Escrow[]`).
 * `db.rate.create()` (no relations), `db.transaction.create()` and
 * `db.escrow.create()` (both have only a singular `user User @relation`,
 * no list field) all work fine with the normal client API - only `User`
 * has list-relation fields, so it's the only model that needs this
 * workaround. Safe to switch back to `db.user.upsert()` once the project
 * upgrades past whatever prisma version fixes this (8.0.0-rc.13 was
 * already available when this was written - worth checking first).
 */
async function upsertUser(u: {
  email: string;
  firstName: string;
  lastName: string;
  kycStatus: KycStatus;
  stellarPublicKey: string | null;
}): Promise<{ id: string; email: string }> {
  await db.$executeRaw`
    INSERT INTO users (id, email, "firstName", "lastName", "passwordHash", "kycStatus", "stellarPublicKey", "updatedAt")
    VALUES (${randomUUID()}, ${u.email}, ${u.firstName}, ${u.lastName}, ${DEV_PASSWORD_HASH}, ${u.kycStatus}::"KycStatus", ${u.stellarPublicKey}, now())
    ON CONFLICT (email) DO UPDATE SET
      "firstName" = EXCLUDED."firstName",
      "lastName" = EXCLUDED."lastName",
      "kycStatus" = EXCLUDED."kycStatus",
      "stellarPublicKey" = EXCLUDED."stellarPublicKey",
      "updatedAt" = now()
  `;
  return db.user.findUniqueOrThrow({ where: { email: u.email }, select: { id: true, email: true } });
}

export interface SeedUser {
  email: string;
  firstName: string;
  lastName: string;
  kycStatus: KycStatus;
  stellarPublicKey: string | null;
}

/**
 * Pure data-builder, separated out from the DB-writing code below so
 * `prisma/__tests__/seed.test.ts` can check the shape of the seed data
 * (unique emails, valid Stellar keys, valid enum values) without needing a
 * live database. Generates a fresh Stellar keypair each call - that's
 * intentional, seeded data doesn't need stable keys across runs.
 */
export function buildSeedUsers(): SeedUser[] {
  return [
    {
      email: "alice@example.com",
      firstName: "Alice",
      lastName: "Nakamura",
      kycStatus: KycStatus.verified,
      stellarPublicKey: Keypair.random().publicKey(),
    },
    {
      email: "bob@example.com",
      firstName: "Bob",
      lastName: "Okafor",
      kycStatus: KycStatus.pending,
      stellarPublicKey: null,
    },
    {
      email: "carol@example.com",
      firstName: "Carol",
      lastName: "Mendez",
      kycStatus: KycStatus.rejected,
      stellarPublicKey: null,
    },
  ];
}

// Mirrors the pairs refreshAllRates() (src/lib/rates.ts) keeps warm, plus
// matching hardcoded fallback values so the seeded numbers look sane
// wherever they show up in the UI.
export const SEED_RATES: { fromAsset: string; toAsset: string; rate: string }[] = [
  { fromAsset: "XLM", toAsset: "USD", rate: "0.1042" },
  { fromAsset: "USDC", toAsset: "USD", rate: "1.00" },
  { fromAsset: "EURC", toAsset: "USD", rate: "1.09" },
  { fromAsset: "USD", toAsset: "NGN", rate: "1495.00" },
  { fromAsset: "USD", toAsset: "EUR", rate: "0.92" },
];

async function seedUsers() {
  const created: { id: string; email: string }[] = [];
  for (const u of buildSeedUsers()) {
    created.push(await upsertUser(u));
  }
  return created;
}

async function seedRates() {
  for (const r of SEED_RATES) {
    await db.rate.upsert({
      where: { fromAsset_toAsset: { fromAsset: r.fromAsset, toAsset: r.toAsset } },
      update: { rate: r.rate, fetchedAt: new Date() },
      create: r,
    });
  }
}

async function seedTransactionsAndEscrow(users: { id: string; email: string }[]) {
  const alice = users.find((u) => u.email === "alice@example.com");
  const bob = users.find((u) => u.email === "bob@example.com");
  if (!alice || !bob) return;

  // A confirmed, plain (no-escrow) transaction for Alice - the common case
  // that shows up on the activity/dashboard pages.
  const existingPlain = await db.transaction.findFirst({
    where: { userId: alice.id, recipientAddress: "SEED-PLAIN-RECIPIENT" },
  });
  if (!existingPlain) {
    await db.transaction.create({
      data: {
        userId: alice.id,
        fromAsset: "USDC",
        toAsset: "NGN",
        fromAmount: "100.00",
        toAmount: "149500.00",
        recipientAddress: "SEED-PLAIN-RECIPIENT",
        stellarTxHash: "seed-tx-hash-plain-0001",
        status: TransactionStatus.confirmed,
        confirmedAt: new Date(),
      },
    });
  }

  // A pending transaction backed by an escrow contract for Bob - exercises
  // the Transaction <-> Escrow relationship (escrowId / one-to-one on
  // Escrow.transactionId) so escrow-related UI has something to render too.
  const existingEscrowTx = await db.transaction.findFirst({
    where: { userId: bob.id, recipientAddress: "SEED-ESCROW-RECIPIENT" },
  });
  if (!existingEscrowTx) {
    const senderKeypair = Keypair.random();
    const recipientKeypair = Keypair.random();

    const escrowTx = await db.transaction.create({
      data: {
        userId: bob.id,
        fromAsset: "XLM",
        toAsset: "USDC",
        fromAmount: "500.00",
        recipientAddress: "SEED-ESCROW-RECIPIENT",
        status: TransactionStatus.pending,
      },
    });

    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24);

    const escrow = await db.escrow.create({
      data: {
        userId: bob.id,
        transactionId: escrowTx.id,
        contractAddress: Keypair.random().publicKey(),
        senderAddress: senderKeypair.publicKey(),
        recipientAddress: recipientKeypair.publicKey(),
        amount: "500.00",
        asset: "XLM",
        status: EscrowStatus.locked,
        expiresAt,
      },
    });

    await db.transaction.update({
      where: { id: escrowTx.id },
      data: { escrowId: escrow.id },
    });
  }
}

async function main() {
  console.log("[seed] Seeding users...");
  const users = await seedUsers();
  console.log(`[seed] ${users.length} users ready.`);

  console.log("[seed] Seeding rates...");
  await seedRates();
  console.log("[seed] Rates ready.");

  console.log("[seed] Seeding transactions + escrow...");
  await seedTransactionsAndEscrow(users);
  console.log("[seed] Transactions ready.");

  console.log("[seed] Done. Dev login for every seeded user: password 'devpassword123'.");
}

// Only run against the database when this file is executed directly (`npx
// prisma db seed` / `npx tsx prisma/seed.ts`) - not when it's imported, e.g.
// by prisma/__tests__/seed.test.ts importing buildSeedUsers()/SEED_RATES
// for shape checks. Without this guard, importing the module for tests
// would also try to run the full seed against whatever DATABASE_URL (or
// lack of one) happens to be set in that environment.
const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  main()
    .catch((err) => {
      console.error("[seed] Failed:", err);
      process.exitCode = 1;
    })
    .finally(async () => {
      await db.$disconnect();
    });
}
