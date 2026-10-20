import { HORIZON_URL } from "@/lib/stellar";
import { supabase } from "@/lib/supabase";
import { successResponse } from "@/lib/api-response";

// Every API route in this app reads cookies / request data, so none of them
// can be pre-rendered at build time. Without this, `next build` tries to
// statically collect their data (hitting Supabase/Horizon without env vars)
// and the build stalls or fails on Vercel.
export const dynamic = "force-dynamic";

// Fail the Stellar reachability check fast instead of hanging on a
// half-open connection -- a slow/unreachable Horizon shouldn't make an
// uptime monitor's health check itself time out.
const STELLAR_CHECK_TIMEOUT_MS = 5000;

async function checkDatabase(): Promise<boolean> {
  try {
    // A lightweight read against a real table. `.limit(0)` (HEAD-style)
    // avoids pulling rows while still proving connectivity + credentials.
    const { error } = await supabase.from("users").select("id").limit(0);
    return !error;
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
