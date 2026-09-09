import { NextResponse } from "next/server";
import { rateLimit, logSecurityEvent } from "@/lib/security";

/**
 * CORS audit note: this endpoint is listed as a public path (no auth
 * required) but is a write/beacon endpoint meant only for first-party
 * page-view tracking from the RemitX site itself - not something a
 * third-party page should be able to call. Unlike /api/public/rate, it
 * intentionally does NOT set Access-Control-Allow-Origin, so browsers
 * block cross-origin JS from reading (or, for non-simple requests,
 * even sending) it. That's a deliberate default, not an oversight -
 * do not add an open CORS policy here.
 */
export async function POST(request: Request) {
  try {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const rl = rateLimit(`analytics:${ip}`, 60, 60_000);
    if (!rl.allowed) {
      logSecurityEvent("rate_limited", { ip, endpoint: "analytics" });
      return NextResponse.json({ success: false }, { status: 429 });
    }

    const body = await request.json();
    const { url, referrer, ts } = body;

    // In production, this would write to a database or analytics service.
    // For now, we log to server console (Vercel logs) for visibility.
    console.log(
      JSON.stringify({
        type: "pageview",
        url: url || "/",
        referrer: referrer || "",
        ts: ts || Date.now(),
        ip,
        userAgent: request.headers.get("user-agent") || "unknown",
      })
    );

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ success: false }, { status: 400 });
  }
}