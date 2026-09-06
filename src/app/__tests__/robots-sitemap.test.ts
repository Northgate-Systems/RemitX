import { describe, it, expect } from "vitest";
import robots from "../robots";
import sitemap from "../sitemap";

const AUTH_ONLY_PATHS = [
  "/api/",
  "/dashboard",
  "/send",
  "/review",
  "/activity",
  "/anchors",
  "/routes",
  "/support",
];

describe("robots()", () => {
  const result = robots();

  it("allows the public site by default", () => {
    expect(result.rules).toMatchObject({
      userAgent: "*",
      allow: "/",
    });
  });

  it("disallows every authenticated-only route", () => {
    const rules = result.rules as { disallow?: string | string[] };
    const disallow = Array.isArray(rules.disallow)
      ? rules.disallow
      : rules.disallow
        ? [rules.disallow]
        : [];

    for (const path of AUTH_ONLY_PATHS) {
      expect(disallow).toContain(path);
    }
  });

  it("points at the canonical sitemap URL", () => {
    expect(result.sitemap).toBe("https://remitx.app/sitemap.xml");
  });
});

describe("sitemap()", () => {
  const entries = sitemap();

  it("returns a non-empty list of entries", () => {
    expect(Array.isArray(entries)).toBe(true);
    expect(entries.length).toBeGreaterThan(0);
  });

  it("includes the public marketing/legal pages", () => {
    const urls = entries.map((e) => e.url);
    expect(urls).toContain("https://remitx.app");
    expect(urls).toContain("https://remitx.app/login");
    expect(urls).toContain("https://remitx.app/legal/privacy");
    expect(urls).toContain("https://remitx.app/legal/terms");
  });

  it("excludes every authenticated-only route disallowed in robots.ts", () => {
    const urls = entries.map((e) => e.url);
    for (const path of AUTH_ONLY_PATHS) {
      const authUrl = `https://remitx.app${path}`;
      expect(urls).not.toContain(authUrl);
      // also guard against a trailing-slash variant slipping through
      expect(urls).not.toContain(`${authUrl}/`);
    }
  });

  it("gives every entry a valid lastModified Date and a priority in [0, 1]", () => {
    for (const entry of entries) {
      expect(entry.lastModified).toBeInstanceOf(Date);
      expect(Number.isNaN((entry.lastModified as Date).getTime())).toBe(false);
      if (typeof entry.priority === "number") {
        expect(entry.priority).toBeGreaterThanOrEqual(0);
        expect(entry.priority).toBeLessThanOrEqual(1);
      }
    }
  });

  it("does not duplicate any URL", () => {
    const urls = entries.map((e) => e.url);
    expect(new Set(urls).size).toBe(urls.length);
  });
});
