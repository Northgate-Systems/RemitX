import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifyToken } from "@/lib/jwt";
import { applySecurityHeaders, logSecurityEvent } from "@/lib/security-edge";

// NOTE: Next.js 16 renamed the `middleware` file convention to `proxy`.
// This file must stay named `src/proxy.ts` and export `proxy` (not
// `middleware`), otherwise the production build warns:
//   `The "middleware" file convention is deprecated. Please use "proxy" instead.`
// See https://nextjs.org/docs/messages/middleware-to-proxy

// Static assets that must never trigger auth/CORS logic.
const PUBLIC_FILE = /\.(png|svg|jpg|jpeg|ico|css|js|map|txt|xml|webmanifest)$/;

const publicPathPrefixes = [
  "/_next/",
  "/favicon.ico",
  "/robots.txt",
  "/sitemap.xml",
  "/api/auth/login",
  "/api/auth/register",
  "/api/auth/forgot-password",
  "/api/auth/reset-password",
  "/api/public/",
  "/api/analytics",
  "/api/health",
];

const publicPagePrefixes = ["/", "/login", "/thank-you", "/legal/"];

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_FILE.test(pathname)) return true;
  if (publicPathPrefixes.some((p) => pathname === p || pathname.startsWith(p))) {
    return true;
  }
  // Exact "/" only — `startsWith("/")` would mark *every* route public.
  if (pathname === "/") return true;
  return publicPagePrefixes.some(
    (p) => p !== "/" && (pathname === p || pathname.startsWith(p))
  );
}

const isDev = process.env.NODE_ENV !== "production";

function getAllowedOrigins(): string[] {
  const configured = (process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  return configured.length > 0
    ? configured
    : ["https://remitx.app", "https://remitx.vercel.app"];
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const response = NextResponse.next();

  // Apply security headers to all responses
  applySecurityHeaders(response);

  // Allow public paths before any auth/CORS checks
  if (isPublicPath(pathname)) {
    return response;
  }

  // CORS lockdown for authenticated API routes - only in production.
  // In dev, we don't know the exact origin (localhost:3000 vs 127.0.0.1 etc).
  // Same-origin / non-browser fetches send no Origin header — always allow those.
  if (!isDev && pathname.startsWith("/api/")) {
    const origin = request.headers.get("origin");
    if (origin && !getAllowedOrigins().includes(origin)) {
      logSecurityEvent("csrf_blocked", { origin, pathname, reason: "disallowed_origin" });
      return NextResponse.json(
        { success: false, error: "Origin not allowed" },
        { status: 403 }
      );
    }
  }

  // Check for session cookie
  const token = request.cookies.get("remitx_session")?.value;
  if (!token) {
    // Redirect to login for page routes, return 401 for API routes
    if (pathname.startsWith("/api/")) {
      logSecurityEvent("unauthorized_access", { pathname, reason: "no_token" });
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const payload = await verifyToken(token);
  if (!payload) {
    if (pathname.startsWith("/api/")) {
      logSecurityEvent("invalid_token", { pathname, reason: "invalid_signature" });
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return response;
}

export const config = {
  matcher: [
    // Apply to all routes except static files
    "/((?!static|public|_next/static|_next/image|.*\\.png$|.*\\.svg$|.*\\.jpg$|.*\\.ico$|.*\\.css$|.*\\.js$).*)",
    "/api/:path*",
  ],
};
