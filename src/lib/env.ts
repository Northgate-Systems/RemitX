import { z } from "zod";

/**
 * Startup environment validation (#396).
 *
 * Before this, a half-configured deploy failed lazily and inconsistently:
 * supabase.ts throws the first time a route actually queries the database
 * (see its lazy Proxy), turnstile.ts silently *skips* verification and only
 * logs a warning, and JWT_SECRET/CSRF_SECRET quietly fall back to the
 * public dev secrets committed in this repo. Each of those behaviors is
 * intentional for local development (see .env.example) - `npm run dev`
 * needs to boot without a fully configured .env. The gap is that none of
 * that leniency is supposed to apply in production, and until now nothing
 * actually enforced that: a production deploy missing a real env var either
 * ran with a public secret it shouldn't, or crashed only when the first
 * request happened to touch the missing var, with a different error shape
 * depending on which one.
 *
 * validateEnv() collects every missing required-in-production variable in
 * one pass and throws a single aggregated error naming all of them, instead
 * of surfacing them one at a time across unrelated requests. It is a no-op
 * outside production so it never affects `npm run dev` or the test suite.
 *
 * Deliberately NOT included here: DATABASE_URL (the generated Prisma client
 * in src/generated/prisma is not used by any application route at runtime -
 * every route queries via src/lib/supabase.ts instead - so requiring it
 * would fail production boots that don't need it) and
 * STELLAR_NETWORK/STELLAR_HORIZON_URL/NEXT_PUBLIC_APP_URL (all have working
 * defaults today and are not read anywhere as a hard requirement).
 */

const REQUIRED_ENV_LABELS: Record<string, string> = {
  SUPABASE_URL_ANY: "NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL)",
};

const productionEnvSchema = z.object({
  SUPABASE_URL_ANY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  JWT_SECRET: z.string().min(1),
  TURNSTILE_SECRET_KEY: z.string().min(1),
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: z.string().min(1),
  CSRF_SECRET: z.string().min(1),
});

/**
 * Validates that every environment variable required to run this app in
 * production is actually set. Pass a custom `env` (e.g. in tests) instead
 * of relying on the ambient `process.env`.
 *
 * @throws if NODE_ENV is "production" and one or more required variables
 * are missing. No-op for any other NODE_ENV.
 */
export function validateEnv(env: NodeJS.ProcessEnv = process.env): void {
  if (env.NODE_ENV !== "production") return;

  const result = productionEnvSchema.safeParse({
    SUPABASE_URL_ANY: env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL || "",
    SUPABASE_SERVICE_ROLE_KEY: env.SUPABASE_SERVICE_ROLE_KEY || "",
    JWT_SECRET: env.JWT_SECRET || "",
    TURNSTILE_SECRET_KEY: env.TURNSTILE_SECRET_KEY || "",
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "",
    CSRF_SECRET: env.CSRF_SECRET || "",
  });

  if (!result.success) {
    const missing = [...new Set(result.error.issues.map((issue) => {
      const key = String(issue.path[0]);
      return REQUIRED_ENV_LABELS[key] || key;
    }))];

    throw new Error(
      `[env] Missing required environment variable(s) in production: ${missing.join(", ")}. ` +
        "See .env.example for how to set each one."
    );
  }
}
