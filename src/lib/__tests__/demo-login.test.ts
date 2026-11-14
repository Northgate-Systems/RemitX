import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { NextRequest } from "next/server";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { resetMemoryStore } from "./data/memory/memory-adapter";

const cookieStore = new Map<string, { value: string }>();
vi.mock("next/headers", () => ({
  cookies: vi.fn().mockResolvedValue({
    get: (k: string) => cookieStore.get(k),
    set: (k: string, v: string) => cookieStore.set(k, { value: v }),
    delete: (k: string) => cookieStore.delete(k),
  }),
}));

import { POST as demoLoginPost } from "@/app/api/auth/demo-login/route";
import * as demoLoginRoute from "@/app/api/auth/demo-login/route";
import { isDemoLoginEnabled } from "./demo-login";

const makeRequest = (ip = "127.0.0.1") =>
  new Request("http://localhost/api/auth/demo-login", {
    method: "POST",
    headers: { "x-forwarded-for": ip },
  }) as unknown as NextRequest;

describe("demo login hardening (#590)", () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalEnableDemo = process.env.ENABLE_DEMO_LOGIN;

  beforeEach(() => {
    resetMemoryStore();
    cookieStore.clear();
  });

  afterEach(() => {
    (process.env as Record<string, string | undefined>).NODE_ENV = originalNodeEnv;
    if (originalEnableDemo === undefined) {
      delete process.env.ENABLE_DEMO_LOGIN;
    } else {
      process.env.ENABLE_DEMO_LOGIN = originalEnableDemo;
    }
  });

  it("removes the duplicate /api/auth/demo route and only exports POST on /api/auth/demo-login", () => {
    const duplicateRoute = join(process.cwd(), "src", "app", "api", "auth", "demo", "route.ts");
    expect(existsSync(duplicateRoute)).toBe(false);
    expect(typeof demoLoginRoute.POST).toBe("function");
    expect("GET" in demoLoginRoute).toBe(false);
  });

  it("removes hardcoded password from src/lib/demo-login.ts", () => {
    const src = readFileSync(join(process.cwd(), "src", "lib", "demo-login.ts"), "utf8");
    expect(src.includes("Password123!")).toBe(false);
    expect(src.includes("DEMO_PASSWORD")).toBe(false);
  });

  it("returns 404 in production even if ENABLE_DEMO_LOGIN is true", async () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = "production";
    process.env.ENABLE_DEMO_LOGIN = "true";

    expect(isDemoLoginEnabled()).toBe(false);
    const res = await demoLoginPost(makeRequest("10.0.0.1"));
    expect(res.status).toBe(404);
    expect(cookieStore.has("remitx_session")).toBe(false);
  });

  it("returns 404 in development when ENABLE_DEMO_LOGIN is not 'true'", async () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = "development";
    delete process.env.ENABLE_DEMO_LOGIN;

    expect(isDemoLoginEnabled()).toBe(false);
    const res = await demoLoginPost(makeRequest("10.0.0.2"));
    expect(res.status).toBe(404);
    expect(cookieStore.has("remitx_session")).toBe(false);
  });

  it("succeeds on POST in non-production when ENABLE_DEMO_LOGIN='true'", async () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = "development";
    process.env.ENABLE_DEMO_LOGIN = "true";

    expect(isDemoLoginEnabled()).toBe(true);
    const res = await demoLoginPost(makeRequest("10.0.0.3"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.user.email).toBe("alice@remitx.dev");
    expect(cookieStore.get("remitx_session")?.value).toBeTruthy();
  });
});
