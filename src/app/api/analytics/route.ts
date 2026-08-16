import { NextResponse } from "next/server";
import { rateLimit, logSecurityEvent } from "@/lib/security";

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