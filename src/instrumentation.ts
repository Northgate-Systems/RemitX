/**
 * Next.js instrumentation hook - runs once when the server starts, before
 * the first request is handled (see
 * https://nextjs.org/docs/app/guides/instrumentation). Used here to fail
 * fast in production if a required environment variable is missing (#396),
 * instead of finding out on whichever request happens to touch it first.
 *
 * Guarded to the Node.js runtime because the Edge runtime (middleware.ts)
 * also loads this file, and validateEnv()'s only side effect (throwing) is
 * something we want to happen exactly once per server start, not once per
 * edge worker.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { validateEnv } = await import("@/lib/env");
    validateEnv();
  }
}
