import { NextResponse } from "next/server";

/**
 * Edge-runtime-safe security utilities.
 * These functions do NOT use Node.js `crypto` and can be safely
 * imported by middleware (which runs in the Edge Runtime).
 */

// Single source of truth for the response security headers. `next.config.ts`
// imports this same list for its `headers()` config so that static assets
// excluded from the middleware matcher (see `config.matcher` in
// middleware.ts - _next/static, images, .css/.js, etc.) still get the exact
// same header values instead of a second, hand-copied set that can drift out
// of sync (previously next.config.ts had X-Frame-Options: SAMEORIGIN and
// Cross-Origin-Opener-Policy: same-origin-allow-popups while this file used
// stricter DENY / same-origin - two different policies for the same site
// depending on which path served the response).
export const SECURITY_HEADERS: ReadonlyArray<{ key: string; value: string }> = [
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      // Allow Turnstile + Next.js inline scripts (Next injects inline scripts)
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://challenges.cloudflare.com",
      // Allow Tailwind-injected styles + Google Fonts
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      // Allow Google Fonts woff2 + Turnstile font assets
      "font-src 'self' https://fonts.gstatic.com data: https://challenges.cloudflare.com",
      // Allow our images + Turnstile injected pixel/favicon
      "img-src 'self' data: blob: https://challenges.cloudflare.com",
      // Turnstile connects to challenges.cloudflare.com for widget + validation
      "connect-src 'self' https://horizon-testnet.stellar.org https://api.stellar.org https://challenges.cloudflare.com",
      // Turnstile renders in an iframe hosted on challenges.cloudflare.com
      "frame-src https://challenges.cloudflare.com",
      "worker-src 'self' blob:",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'self'",
    ].join("; "),
  },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "X-XSS-Protection", value: "1; mode=block" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
];

export function applySecurityHeaders(response: NextResponse): NextResponse {
  for (const { key, value } of SECURITY_HEADERS) {
    response.headers.set(key, value);
  }
  return response;
}

// Development origins — localhost variants are all allowed in dev.
// In production only the real domain + Vercel preview domains pass.
export const ALLOWED_ORIGINS = new Set([
  "https://remitx.app",
  "https://remitx.vercel.app",
  "http://localhost:3000",
  "http://localhost:3001",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:3001",
]);

export function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return true; // same-origin / non-CORS requests are fine
  return ALLOWED_ORIGINS.has(origin);
}

export function logSecurityEvent(
  type: string,
  details: Record<string, unknown> = {}
): void {
  const entry = {
    type,
    ts: new Date().toISOString(),
    ...details,
  };
  console.log(`[SECURITY] ${JSON.stringify(entry)}`);
}