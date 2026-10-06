// The Prisma client in this project talks to Postgres at import time via
// `new PrismaPg({ connectionString: process.env.DATABASE_URL })`. Vercel
// builds don't always have DATABASE_URL set (and this app's live path uses
// Supabase, not Prisma — see `src/lib/supabase.ts`), so creating the client
// eagerly would crash `next build` with a missing-env error. Defer creation
// until first use: anything that never calls `db` (including the build)
// never pays for it, and a missing DATABASE_URL only throws if code actually
// touches the database.
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "[db] DATABASE_URL is not set. The live app path uses Supabase (see src/lib/supabase.ts) — set DATABASE_URL only if you need the legacy Prisma path."
    );
  }
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter });
}

function getPrismaClient(): PrismaClient {
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = createPrismaClient();
  }
  return globalForPrisma.prisma;
}

// Lazily-created legacy client. Prefer `supabase` from `@/lib/supabase` for
// new code — this export only exists for the health check's old tests and any
// leftover Prisma call sites.
export const db = new Proxy({} as PrismaClient, {
  get(_target, prop, receiver) {
    return Reflect.get(getPrismaClient(), prop, receiver);
  },
});
