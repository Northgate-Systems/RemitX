/**
 * Cloudflare Turnstile verification.
 *
 * Requires TURNSTILE_SECRET_KEY (server) and NEXT_PUBLIC_TURNSTILE_SITE_KEY
 * (client) - see .env.example for how to get both from the Cloudflare
 * dashboard.
 *
 * Fail-closed in production: without a configured secret key verification
 * FAILS in production (returns success:false) so bots can't walk through an
 * unconfigured challenge. In development it's skipped so `npm run dev` still
 * works before you've set real keys.
 */

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

const isProduction = process.env.NODE_ENV === "production";

export async function verifyTurnstileToken(token: string | undefined | null): Promise<{
  success: boolean;
  reason?: string;
}> {
  const secret = process.env.TURNSTILE_SECRET_KEY;

  if (!secret) {
    if (isProduction) {
      console.error(
        "[turnstile] TURNSTILE_SECRET_KEY not set in production - rejecting verification. Set it in your host's environment settings."
      );
      return { success: false, reason: "Verification is not configured" };
    }
    console.warn(
      "[turnstile] TURNSTILE_SECRET_KEY not set - skipping verification (development only). Set it in .env before going to production."
    );
    return { success: true };
  }

  if (!token) {
    return { success: false, reason: "Missing verification token" };
  }

  try {
    const res = await fetch(VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret, response: token }),
      signal: AbortSignal.timeout(8_000),
    });
    const data = await res.json();
    if (data.success) return { success: true };
    return { success: false, reason: Array.isArray(data["error-codes"]) ? data["error-codes"].join(", ") : "Verification failed" };
  } catch {
    return { success: false, reason: "Couldn't reach the verification service" };
  }
}
