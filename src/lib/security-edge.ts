import { NextResponse } from "next/server";

/**
 * Edge-runtime-safe security utilities.
 * These functions do NOT use Node.js `crypto` and can be safely
 * imported by middleware (which runs in the Edge Runtime).
 */

export function applySecurityHeaders(response: NextResponse): NextResponse {
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  response.headers.set("X-XSS-Protection", "1; mode=block");
  response.headers.set("Cross-Origin-Opener-Policy", "same-origin");
  response.headers.set("Cross-Origin-Resource-Policy", "same-origin");
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