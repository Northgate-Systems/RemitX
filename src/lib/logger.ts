/**
 * ── Structured logging ────────────────────────────────────────────────────
 * Emits every server log line as a single JSON object so a production log
 * aggregator (Datadog, CloudWatch, Vercel log drains, etc.) can parse and
 * index it without fragile string-scraping. Safe for both the Node.js and
 * Edge runtimes — no Node-only APIs are used.
 *
 * Usage:
 *   import { logger } from "@/lib/logger";
 *   logger.error("Send error", { err, userId });
 *   logger.warn("Rate limited", { key, retryAfterMs });
 *   logger.info("Registration complete", { userId });
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

export type LogFields = Record<string, unknown>;

/**
 * Errors don't serialize usefully with plain JSON.stringify (message/stack
 * are non-enumerable on Error.prototype), so any `err`/`error` field gets
 * expanded into a plain object first.
 */
function normalizeFields(fields: LogFields): LogFields {
  const out: LogFields = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value instanceof Error) {
      out[key] = {
        name: value.name,
        message: value.message,
        stack: value.stack,
      };
    } else {
      out[key] = value;
    }
  }
  return out;
}

function emit(level: LogLevel, msg: string, fields?: LogFields): void {
  const entry = {
    level,
    msg,
    ts: new Date().toISOString(),
    ...(fields ? normalizeFields(fields) : {}),
  };

  const line = JSON.stringify(entry);

  // Route by severity so log platforms that split stdout/stderr (e.g. by
  // level) still bucket things correctly.
  if (level === "error") {
    console.error(line);
  } else if (level === "warn") {
    console.warn(line);
  } else {
    console.log(line);
  }
}

export const logger = {
  debug: (msg: string, fields?: LogFields) => emit("debug", msg, fields),
  info: (msg: string, fields?: LogFields) => emit("info", msg, fields),
  warn: (msg: string, fields?: LogFields) => emit("warn", msg, fields),
  error: (msg: string, fields?: LogFields) => emit("error", msg, fields),
};

/**
 * Shared between `security.ts` (Node runtime) and `security-edge.ts` (Edge
 * runtime, imported by middleware) so a "this was blocked/suspicious" event
 * logs at the same level regardless of which runtime raised it. Lives here
 * rather than in either security module so neither has to import the other
 * (security-edge.ts must stay free of Node-only APIs).
 */
export const WARN_SECURITY_EVENT_TYPES = new Set<string>([
  "login_failed",
  "login_locked",
  "csrf_blocked",
  "rate_limited",
  "invalid_token",
  "unauthorized_access",
  "upload_blocked",
  "prompt_injection_blocked",
]);

export function securityEventLevel(type: string): "info" | "warn" {
  return WARN_SECURITY_EVENT_TYPES.has(type) ? "warn" : "info";
}
