"use client";

import { useEffect, useRef, useState } from "react";
import { WifiOff, Wifi } from "lucide-react";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";

const RECONNECTED_MESSAGE_MS = 3000;

/**
 * Fixed top banner that tells the user when the browser has lost network
 * connectivity, so requests failing mid-flow (e.g. on the send page) have an
 * obvious explanation instead of looking like a silent app bug. Briefly
 * confirms when connectivity comes back, then hides itself.
 */
export default function OfflineBanner() {
  const isOnline = useOnlineStatus();
  const [showReconnected, setShowReconnected] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function handleOnline() {
      setShowReconnected(true);
      if (hideTimer.current) clearTimeout(hideTimer.current);
      hideTimer.current = setTimeout(() => setShowReconnected(false), RECONNECTED_MESSAGE_MS);
    }

    window.addEventListener("online", handleOnline);
    return () => {
      window.removeEventListener("online", handleOnline);
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, []);

  if (isOnline && !showReconnected) return null;

  const offline = !isOnline;

  return (
    <div
      role="status"
      aria-live={offline ? "assertive" : "polite"}
      className={`fixed top-0 left-0 right-0 z-[70] px-4 py-2.5 text-center text-xs font-semibold flex items-center justify-center gap-2 transition-colors ${
        offline ? "bg-amber-50 text-amber-800 border-b border-amber-200" : "bg-emerald-50 text-emerald-800 border-b border-emerald-200"
      }`}
    >
      {offline ? (
        <>
          <WifiOff size={14} className="shrink-0" aria-hidden="true" />
          <span>You&apos;re offline — some actions won&apos;t work until your connection is back.</span>
        </>
      ) : (
        <>
          <Wifi size={14} className="shrink-0" aria-hidden="true" />
          <span>Back online.</span>
        </>
      )}
    </div>
  );
}
