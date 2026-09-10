import { describe, it, expect } from "vitest";
import { validateEnv } from "../env";

const FULL_PROD_ENV = {
  NODE_ENV: "production",
  NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
  JWT_SECRET: "a-real-production-secret-at-least-32-chars-long",
  TURNSTILE_SECRET_KEY: "turnstile-secret",
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: "turnstile-site-key",
  CSRF_SECRET: "csrf-secret",
} as unknown as NodeJS.ProcessEnv;

describe("validateEnv", () => {
  it("is a no-op outside production, even with nothing set", () => {
    expect(() => validateEnv({ NODE_ENV: "development" } as NodeJS.ProcessEnv)).not.toThrow();
    expect(() => validateEnv({ NODE_ENV: "test" } as NodeJS.ProcessEnv)).not.toThrow();
    expect(() => validateEnv({} as NodeJS.ProcessEnv)).not.toThrow();
  });

  it("passes in production when every required variable is set", () => {
    expect(() => validateEnv(FULL_PROD_ENV)).not.toThrow();
  });

  it("accepts SUPABASE_URL as an alternative to NEXT_PUBLIC_SUPABASE_URL", () => {
    const env = { ...FULL_PROD_ENV } as Record<string, string>;
    delete env.NEXT_PUBLIC_SUPABASE_URL;
    env.SUPABASE_URL = "https://project.supabase.co";
    expect(() => validateEnv(env as unknown as NodeJS.ProcessEnv)).not.toThrow();
  });

  it("throws in production when a required variable is missing", () => {
    const env = { ...FULL_PROD_ENV } as Record<string, string>;
    delete env.JWT_SECRET;
    expect(() => validateEnv(env as unknown as NodeJS.ProcessEnv)).toThrow(/JWT_SECRET/);
  });

  it("throws once with every missing variable named, not just the first", () => {
    const env = { NODE_ENV: "production" } as unknown as NodeJS.ProcessEnv;
    try {
      validateEnv(env);
      expect.fail("expected validateEnv to throw");
    } catch (err) {
      const message = (err as Error).message;
      expect(message).toContain("SUPABASE_SERVICE_ROLE_KEY");
      expect(message).toContain("JWT_SECRET");
      expect(message).toContain("TURNSTILE_SECRET_KEY");
      expect(message).toContain("NEXT_PUBLIC_TURNSTILE_SITE_KEY");
      expect(message).toContain("CSRF_SECRET");
      expect(message).toContain("NEXT_PUBLIC_SUPABASE_URL");
    }
  });

  it("throws when neither NEXT_PUBLIC_SUPABASE_URL nor SUPABASE_URL is set", () => {
    const env = { ...FULL_PROD_ENV } as Record<string, string>;
    delete env.NEXT_PUBLIC_SUPABASE_URL;
    expect(() => validateEnv(env as unknown as NodeJS.ProcessEnv)).toThrow(
      /NEXT_PUBLIC_SUPABASE_URL \(or SUPABASE_URL\)/
    );
  });

  it("treats an empty string the same as unset", () => {
    const env = { ...FULL_PROD_ENV, CSRF_SECRET: "" } as Record<string, string>;
    expect(() => validateEnv(env as unknown as NodeJS.ProcessEnv)).toThrow(/CSRF_SECRET/);
  });
});
