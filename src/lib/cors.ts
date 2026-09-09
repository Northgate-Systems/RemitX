import { NextResponse } from "next/server";

/**
 * Explicit CORS policy for routes that are intentionally public and
 * read-only (e.g. `/api/public/rate`, used by the landing page and
 * meant to be safe for third-party pages/widgets to call directly).
 *
 * This is deliberately permissive (`*`) but scoped to the handful of
 * routes that opt into it - it's not a global default. The route
 * returns no user-specific data, requires no cookies/auth, and has no
 * side effects, so allowing any origin to read it carries no real risk.
 * `Vary: Origin` is included so caches don't serve a response meant
 * for one origin's preflight to another.
 */
export const PUBLIC_CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
  "Vary": "Origin",
};

/** Attach the public CORS headers to an existing response. */
export function withPublicCors<T extends NextResponse>(response: T): T {
  for (const [key, value] of Object.entries(PUBLIC_CORS_HEADERS)) {
    response.headers.set(key, value);
  }
  return response;
}

/** Standard 204 response for a CORS preflight (OPTIONS) request. */
export function publicCorsPreflight(): NextResponse {
  return withPublicCors(new NextResponse(null, { status: 204 }));
}
