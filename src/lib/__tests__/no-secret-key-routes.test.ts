import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";

function collectRouteFiles(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectRouteFiles(fullPath));
    } else if (entry.isFile() && /\.(ts|tsx|js|jsx)$/.test(entry.name)) {
      files.push(fullPath);
    }
  }
  return files;
}

describe("non-custodial API route guard", () => {
  it("does not expose the /api/stellar/account secret-key generation route", () => {
    const accountRoute = join(process.cwd(), "src", "app", "api", "stellar", "account", "route.ts");
    expect(existsSync(accountRoute)).toBe(false);
  });

  it("ensures no API route generates a random Keypair or calls createTestnetAccount", () => {
    const apiRoot = join(process.cwd(), "src", "app", "api");
    const routeFiles = collectRouteFiles(apiRoot);
    expect(routeFiles.length).toBeGreaterThan(0);

    for (const file of routeFiles) {
      const source = readFileSync(file, "utf8");
      expect(/Keypair\.random\s*\(/.test(source)).toBe(false);
      expect(/\bcreateTestnetAccount\b/.test(source)).toBe(false);
    }
  });
});
