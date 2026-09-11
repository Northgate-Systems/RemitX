"use client";

import { useEffect } from "react";

/**
 * Warns the user with the browser's native confirm dialog if they try to
 * close the tab, refresh, or navigate to a different URL while `isDirty` is
 * true. Browsers ignore any custom message and show their own wording, so
 * `event.returnValue` only needs to be set to a non-empty string to trigger
 * the prompt — it isn't displayed.
 *
 * Note: this only covers full navigations away from the page (the
 * `beforeunload` event). It does not intercept same-app client-side
 * navigation (e.g. clicking a Link in the header), since the App Router
 * doesn't expose a route-change guard for that.
 */
export function useUnsavedChangesWarning(isDirty: boolean) {
  useEffect(() => {
    if (!isDirty) return;

    function handleBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty]);
}
