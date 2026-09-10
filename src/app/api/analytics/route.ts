import { NextResponse } from "next/server";
import { enforceRateLimit, getClientIp } from "@/lib/security";

export async function POST(request: Request) {
  try {
    const limited = enforceRateLimit(request, "analytics");
    if (limited) return limited;

    const ip = getClientIp(request) ?? "unknown";

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