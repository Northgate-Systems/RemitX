"use client";

import { Suspense, useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";

function AnalyticsInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    const consent = localStorage.getItem("remitx_cookie_consent");
    if (consent !== "accepted") return;
    const url = `${pathname}${searchParams?.toString() ? `?${searchParams.toString()}` : ""}`;
    try {
      navigator.sendBeacon?.(
        "/api/analytics",
        new Blob([JSON.stringify({ url, referrer: document.referrer, ts: Date.now() })], { type: "application/json" })
      );
    } catch {
      // best-effort
    }
  }, [pathname, searchParams]);

  return null;
}

export default function Analytics() {
  return (
    <Suspense fallback={null}>
      <AnalyticsInner />
    </Suspense>
  );
}