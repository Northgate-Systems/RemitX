import { createClient } from "@supabase/supabase-js";
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
 */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.warn(
    "[supabase] NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not set — database calls will fail until both are set in .env."
  );
}

const globalForSupabase = globalThis as unknown as {
  supabase: ReturnType<typeof createClient<Database>> | undefined;
};

export const supabase =
  globalForSupabase.supabase ??
  createClient<Database>(supabaseUrl || "", serviceRoleKey || "", {
    auth: { persistSession: false },
  });

if (process.env.NODE_ENV !== "production") globalForSupabase.supabase = supabase;
