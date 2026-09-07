// Pure URL-based heuristic for the global not-found.tsx page.
// Next.js's root not-found.tsx has no way to know *why* a route didn't
// match, so we can only reason about the URL shape itself: which top-level
// section the visitor was likely headed to, and whether that section lives
// behind the authenticated app shell (in which case "back home" should mean
// the dashboard, not the marketing/login root).

export type NotFoundContext = {
  heading: string;
  message: string;
  backHref: string;
  backLabel: string;
};

const SECTION_MESSAGES: Record<string, { heading: string; message: string }> = {
  activity: {
    heading: "Transaction not found",
    message:
      "We couldn't find that transaction. It may have been removed, or the link you followed is out of date.",
  },
  routes: {
    heading: "Route not found",
    message: "We couldn't find that route. It may have been removed or the link is incorrect.",
  },
  anchors: {
    heading: "Anchor not found",
    message: "We couldn't find that anchor. It may have been removed or the link is incorrect.",
  },
  legal: {
    heading: "Legal page not found",
    message: "We couldn't find that legal page. Check the link, or browse our available policies.",
  },
};

// Sections that only exist inside the authenticated app shell — "go back"
// from one of these should land on the dashboard, not the marketing root.
const APP_SECTIONS = new Set([
  "dashboard",
  "activity",
  "anchors",
  "rates",
  "review",
  "routes",
  "send",
  "support",
]);

const DEFAULT_CONTEXT: Pick<NotFoundContext, "heading" | "message"> = {
  heading: "Page not found",
  message: "The page you're looking for doesn't exist or has been moved. Let's get you back on track.",
};

export function getNotFoundContext(pathname: string | null | undefined): NotFoundContext {
  const section = (pathname ?? "").split("/").filter(Boolean)[0];
  const known = section ? SECTION_MESSAGES[section] : undefined;
  const isAppSection = section ? APP_SECTIONS.has(section) : false;

  return {
    heading: known?.heading ?? DEFAULT_CONTEXT.heading,
    message: known?.message ?? DEFAULT_CONTEXT.message,
    backHref: isAppSection ? "/dashboard" : "/",
    backLabel: isAppSection ? "Back to Dashboard" : "Back to Home",
  };
}
