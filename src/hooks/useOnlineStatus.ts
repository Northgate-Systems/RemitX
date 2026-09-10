"use client";

import { useSyncExternalStore } from "react";

function subscribe(callback: () => void): () => void {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

function getSnapshot(): boolean {
  return navigator.onLine;
}

// No `navigator` during SSR/static generation — assume online so the
// server-rendered markup doesn't flash an offline banner on first paint.
function getServerSnapshot(): boolean {
  return true;
}

/**
 * Tracks browser connectivity via the `online`/`offline` window events.
 * Uses `useSyncExternalStore` (rather than `useState` + `useEffect`) so the
 * value is read straight from the browser API without an extra render pass.
 */
export function useOnlineStatus(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
