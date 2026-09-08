import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import robots from "@/app/robots";
import sitemap from "@/app/sitemap";

// Every page under the `(app)` route group sits behind the session check in
// middleware.ts (it's not in `publicPaths`), so it must never be crawlable
// or listed in the sitemap. This walks the actual directory instead of a
// hardcoded list so a future page added under `(app)/` fails this test
// until robots.ts is updated too - that's exactly the drift that let
// "/rates" slip through undisallowed.
const APP_GROUP_DIR = path.resolve(__dirname, "../(app)");

function authenticatedRoutes(): string[] {
  return fs
    .readdirSync(APP_GROUP_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => `/${entry.name}`);
}

describe("robots.ts", () => {
  it("has the expected base shape", () => {
    const result = robots();
    expect(result.rules).toMatchObject({ userAgent: "*", allow: "/" });
    expect(result.sitemap).toBe("https://remitx.app/sitemap.xml");
  });

  it("disallows every authenticated (app) route", () => {
    const result = robots();
    const disallow = ([] as string[]).concat(
      (result.rules as { disallow?: string | string[] }).disallow ?? []
    );

    for (const route of authenticatedRoutes()) {
      const covered = disallow.some((rule) => route === rule || route.startsWith(rule));
      expect(covered, `"${route}" is an authenticated page but robots.ts doesn't disallow it`).toBe(
        true
      );
    }
  });

  it("disallows /api/ so authenticated API routes stay out of the index", () => {
    const result = robots();
    const disallow = ([] as string[]).concat(
      (result.rules as { disallow?: string | string[] }).disallow ?? []
    );
    expect(disallow).toContain("/api/");
  });
});

describe("sitemap.ts", () => {
  it("only lists public, non-authenticated URLs", () => {
    const entries = sitemap();
    const routes = authenticatedRoutes();

    for (const entry of entries) {
      const url = new URL(entry.url);
      for (const route of routes) {
        expect(
          url.pathname === route || url.pathname.startsWith(`${route}/`),
          `sitemap.ts lists "${entry.url}" which is behind auth (${route})`
        ).toBe(false);
      }
    }
  });

  it("every entry is a well-formed, absolute remitx.app URL", () => {
    const entries = sitemap();
    expect(entries.length).toBeGreaterThan(0);
    for (const entry of entries) {
      expect(entry.url).toMatch(/^https:\/\/remitx\.app/);
      expect(entry.lastModified).toBeInstanceOf(Date);
    }
  });
});
