import { createClient, SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types";

/**
 * Server-side Supabase client, used by every API route in src/app/api/.
 *
 * Uses the SERVICE ROLE key, which bypasses Row Level Security — that's
 * intentional here: every API route already authorizes the request itself
 * via the custom JWT session cookie (see lib/auth.ts) before touching the
 * database, the same way the old Prisma setup did. This client must never
 * be imported into a "use client" component — the service role key would
 * end up shipped to the browser.
 *
 * The client is created lazily through a Proxy so that merely importing this
 * module (which happens at build time for every route that uses it) never
 * crashes when NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not
 * set yet. The error only surfaces if an API route actually tries to touch
 * the database without the env vars configured.
 *
 * The URL may be provided as NEXT_PUBLIC_SUPABASE_URL (standard Supabase
 * naming, set in Vercel / Netlify) or SUPABASE_URL (used by this repo's
 * local .env). Both are handled here so the app runs locally and on a host.
 */

const globalForSupabase = globalThis as unknown as {
  supabase: SupabaseClient<Database> | undefined;
};

function getSupabaseClient(): SupabaseClient<Database> {
  // Accept either naming convention — NEXT_PUBLIC_SUPABASE_URL (hosting
  // convention) or SUPABASE_URL (this repo's local .env convention).
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "[supabase] NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY must both be set before calling the database. Add them to .env (local) or your host's project settings."
    );
  }

  if (!globalForSupabase.supabase) {
    globalForSupabase.supabase = createClient<Database>(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });
  }

  return globalForSupabase.supabase;
}

export const supabase = new Proxy(
  {},
  {
    get(_target, prop) {
      if (prop === "then") {
        // Avoid the proxy being treated as a thenable by awaiting code.
        return undefined;
      }
      const client = getSupabaseClient();
      const value = (client as unknown as Record<PropertyKey, unknown>)[prop];
      // Bind methods to the real client so `this` is correct when called.
      return typeof value === "function" ? (value as Function).bind(client) : value;
    },
  }
) as SupabaseClient<Database>;