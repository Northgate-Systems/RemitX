import { db } from "@/lib/db";
import { HORIZON_URL } from "@/lib/stellar";
import { successResponse } from "@/lib/api-response";

// Fail the Stellar reachability check fast instead of hanging on a
// half-open connection -- a slow/unreachable Horizon shouldn't make an
// uptime monitor's health check itself time out.
const STELLAR_CHECK_TIMEOUT_MS = 5000;

async function checkDatabase(): Promise<boolean> {
  try {
    await db.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

async function checkStellar(): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), STELLAR_CHECK_TIMEOUT_MS);
  try {
    const res = await fetch(HORIZON_URL, { signal: controller.signal });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Lightweight, unauthenticated health check for uptime monitoring: verifies
 * DB connectivity and Stellar Horizon reachability. Returns 200 when both
 * dependencies are up, 503 (with which check failed) otherwise -- a load
 * balancer/uptime monitor can key off the status code alone without parsing
 * the body, while the body still tells a human which dependency is down.
 */
export async function GET() {
  const [database, stellar] = await Promise.all([checkDatabase(), checkStellar()]);
  const healthy = database && stellar;

  return successResponse(
    { status: healthy ? "ok" : "degraded", checks: { database, stellar } },
    healthy ? 200 : 503
  );
}
