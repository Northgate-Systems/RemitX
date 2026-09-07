"use client";

import { Suspense, useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * Analytics may only fire once the visitor has explicitly clicked "Accept
 * All" in CookieBanner.tsx (which is the only place that writes this key).
 * Any other value - "declined", a corrupted/unexpected string, or no
 * decision made yet (null, before the banner has been interacted with) -
 * must keep analytics off. Exported as a pure function so the gating logic
 * itself is unit-testable without needing to render the component or mock
 * `localStorage`/Next.js navigation hooks.
 */
export function hasAnalyticsConsent(consentValue: string | null): boolean {
  return consentValue === "accepted";
}

function AnalyticsInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    let consent: string | null = null;
    try {
      consent = localStorage.getItem("remitx_cookie_consent");
    } catch {
      // localStorage can throw (e.g. private browsing with storage
      // disabled) - treat that the same as "no consent given yet".
      return;
    }
    if (!hasAnalyticsConsent(consent)) return;
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