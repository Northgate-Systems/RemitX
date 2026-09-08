import { describe, expect, it } from "vitest";
import { getNotFoundContext } from "@/lib/notFoundContext";

describe("getNotFoundContext", () => {
  it("gives a transaction-specific message for a bad /activity/<id> link", () => {
    const ctx = getNotFoundContext("/activity/does-not-exist");
    expect(ctx.heading).toBe("Transaction not found");
    expect(ctx.message).toMatch(/transaction/i);
    expect(ctx.backHref).toBe("/dashboard");
    expect(ctx.backLabel).toBe("Back to Dashboard");
  });

  it("gives a route-specific message for a bad /routes/<id> link", () => {
    const ctx = getNotFoundContext("/routes/xyz");
    expect(ctx.heading).toBe("Route not found");
    expect(ctx.backHref).toBe("/dashboard");
  });

  it("gives an anchor-specific message for a bad /anchors/<id> link", () => {
    const ctx = getNotFoundContext("/anchors/xyz");
    expect(ctx.heading).toBe("Anchor not found");
    expect(ctx.backHref).toBe("/dashboard");
  });

  it("gives a legal-specific message but keeps the marketing root as home", () => {
    const ctx = getNotFoundContext("/legal/not-a-real-policy");
    expect(ctx.heading).toBe("Legal page not found");
    expect(ctx.backHref).toBe("/");
    expect(ctx.backLabel).toBe("Back to Home");
  });

  it("falls back to a generic message for an unrecognized top-level path", () => {
    const ctx = getNotFoundContext("/whatever/nested/thing");
    expect(ctx.heading).toBe("Page not found");
    expect(ctx.backHref).toBe("/");
  });

  it("treats an app-shell section with no sub-path as an app section (back to dashboard)", () => {
    const ctx = getNotFoundContext("/rates/weird/extra/segment");
    expect(ctx.backHref).toBe("/dashboard");
    expect(ctx.backLabel).toBe("Back to Dashboard");
  });

  it("falls back cleanly for null, undefined, and root paths", () => {
    for (const p of [null, undefined, "/", ""] as const) {
      const ctx = getNotFoundContext(p);
      expect(ctx.heading).toBe("Page not found");
      expect(ctx.backHref).toBe("/");
      expect(ctx.backLabel).toBe("Back to Home");
    }
  });
});
