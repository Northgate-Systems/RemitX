import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifyToken } from "@/lib/jwt";
import { applySecurityHeaders, isAllowedOrigin, logSecurityEvent } from "@/lib/security-edge";

const publicPaths = [
  "/",
  "/login",
  "/api/auth/login",
  "/api/auth/register",
  "/api/auth/forgot-password",
  "/api/auth/reset-password",
  "/api/public/",
  "/api/analytics",
  "/thank-you",
  "/legal/",
  "/_next/",
  "/favicon.ico",
  "/robots.txt",
  "/sitemap.xml",
];

// CSRF-protected methods for state-changing requests
const CSRF_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const response = NextResponse.next();

  // Apply security headers to all responses
  applySecurityHeaders(response);

  // CORS lockdown for API routes
  if (pathname.startsWith("/api/")) {
    const origin = request.headers.get("origin");
    if (origin && !isAllowedOrigin(origin)) {
      logSecurityEvent("csrf_blocked", { origin, pathname, reason: "disallowed_origin" });
      return NextResponse.json(
        { success: false, error: "Origin not allowed" },
        { status: 403 }
      );
    }
  }

  // Allow public paths
  if (publicPaths.some((p) => pathname.startsWith(p))) {
    return response;
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

  const payload = verifyToken(token);
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