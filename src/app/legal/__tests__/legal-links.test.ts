import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

// Verifies every /legal/<slug> link referenced across the app resolves to
// an actual entry in the legal page's PAGES map, so a slug added to
// nav/footer/sitemap can never silently 404, and a slug removed from PAGES
// leaves no dangling link behind (closes #503).

const ROOT = path.resolve(__dirname, "../../../..");
const LEGAL_PAGE_PATH = "src/app/legal/[slug]/page.tsx";

// Files allowed to link to /legal/<slug>. Extend this list if a new place
// in the app starts linking to a legal page.
const REFERENCE_FILES = ["src/components/CookieBanner.tsx", "src/app/landing-client.tsx", "src/app/sitemap.ts"];

const LEGAL_LINK_RE = /\/legal\/([a-z0-9-]+)/g;

function readRoot(relPath: string): string {
  return readFileSync(path.join(ROOT, relPath), "utf8");
}

function definedSlugs(): Set<string> {
  const source = readRoot(LEGAL_PAGE_PATH);
  // PAGES is a `Record<string, {...}>` object literal keyed by slug, e.g.
  //   privacy: { title: ..., body: ... },
  const match = source.match(/const PAGES[^=]*=\s*\{([\s\S]*?)\n\};/);
  if (!match) {
    throw new Error(`Could not find PAGES object literal in ${LEGAL_PAGE_PATH}`);
  }
  const keyRe = /^\s{2}([a-z0-9-]+):\s*\{/gm;
  const slugs = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = keyRe.exec(match[1]))) {
    slugs.add(m[1]);
  }
  return slugs;
}

function referencedSlugs(relPath: string): Set<string> {
  const source = readRoot(relPath);
  const slugs = new Set<string>();
  LEGAL_LINK_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = LEGAL_LINK_RE.exec(source))) {
    slugs.add(m[1]);
  }
  return slugs;
}

describe("legal page links", () => {
  it("defines at least one legal page", () => {
    expect(definedSlugs().size).toBeGreaterThan(0);
  });

  for (const file of REFERENCE_FILES) {
    it(`every /legal/<slug> link in ${file} resolves to defined content`, () => {
      const defined = definedSlugs();
      const referenced = referencedSlugs(file);
      const missing = [...referenced].filter((slug) => !defined.has(slug));
      expect(missing, `dangling /legal/<slug> link(s) in ${file}: ${missing.join(", ")}`).toEqual([]);
    });
  }
});
