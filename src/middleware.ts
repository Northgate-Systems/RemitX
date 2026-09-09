import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifyToken } from "@/lib/jwt";
import { applySecurityHeaders, logSecurityEvent } from "@/lib/security-edge";

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

const isDev = process.env.NODE_ENV !== "production";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const response = NextResponse.next();

  // Apply security headers to all responses
  applySecurityHeaders(response);

  // Allow public paths before any auth/CORS checks.
  // "/" is only meant to mean "the home page itself" - matched with
  // pathname.startsWith(p) it's a prefix of every possible pathname, so it
  // used to make this whole allow-list swallow every route (dashboard,
  // /api/transactions, everything) and skip auth entirely. It needs an
  // exact-match check; the other entries are genuine directory/route
  // prefixes ("/legal/", "/api/public/", "/_next/", ...) and keep prefix
  // matching.
  if (
    pathname === "/" ||
    publicPaths.some((p) => p !== "/" && pathname.startsWith(p))
  ) {
    return response;
  }

  // CORS lockdown for authenticated API routes - only in production
  // In dev, we don't know the exact origin (localhost:3000 vs 127.0.0.1 etc)
  if (!isDev && pathname.startsWith("/api/")) {
    const origin = request.headers.get("origin");
    const allowed = [
      "https://remitx.app",
      "https://remitx.vercel.app",
    ];
    if (origin && !allowed.includes(origin)) {
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
    // A missing cookie on a page that isn't in publicPaths means either the
    // user never logged in or their session just expired mid-visit - the
    // ?expired=1 flag lets the login page tell those apart from a fresh,
    // deliberate visit and show a "your session expired" message instead
    // of silently landing on an unexplained login form.
    return NextResponse.redirect(new URL("/login?expired=1", request.url));
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
    return NextResponse.redirect(new URL("/login?expired=1", request.url));
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