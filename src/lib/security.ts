import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { errorResponse } from "@/lib/api-response";

/**
 * ── Security utilities for RemitX ────────────────────────────────────────
 * Centralizes rate limiting, CSRF, sanitization, request size limits,
 * security event logging, and account lockout.
 */

// ── In-memory rate limiter (per-process) ────────────────────────────────
// For production with multiple instances, replace with Redis/Upstash.
const rateBuckets = new Map<string, { count: number; resetAt: number }>();

// Hard cap so a flood of distinct keys (spoofed headers, many users) cannot
// grow this map without bound. Expired buckets are swept first; if the map is
// still at the cap, the buckets closest to expiry are evicted.
export const MAX_RATE_BUCKETS = 10_000;

function pruneRateBuckets(now: number): void {
  for (const [key, bucket] of rateBuckets) {
    if (bucket.resetAt <= now) {
      rateBuckets.delete(key);
    }
  }
  if (rateBuckets.size < MAX_RATE_BUCKETS) return;

  const byExpiry = [...rateBuckets.entries()].sort(
    (a, b) => a[1].resetAt - b[1].resetAt
  );
  const overflow = rateBuckets.size - MAX_RATE_BUCKETS + 1;
  for (let i = 0; i < overflow; i += 1) {
    rateBuckets.delete(byExpiry[i][0]);
  }
}

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number
): { allowed: boolean; retryAfterMs: number } {
  const now = Date.now();
  const bucket = rateBuckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    if (!bucket && rateBuckets.size >= MAX_RATE_BUCKETS) {
      pruneRateBuckets(now);
    }
    rateBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterMs: 0 };
  }

  if (bucket.count >= limit) {
    return { allowed: false, retryAfterMs: bucket.resetAt - now };
  }

  bucket.count += 1;
  return { allowed: true, retryAfterMs: 0 };
}

/** Test-only helper: drop all rate-limit state. */
export function resetRateLimits(): void {
  rateBuckets.clear();
}

// ── Client IP resolution ────────────────────────────────────────────────
// `X-Forwarded-For` is a list the client can seed: anything the caller sends
// stays in the header and proxies only *append* to it. Reading the leftmost
// entry therefore reads an attacker-controlled value, which lets a caller mint
// a fresh rate-limit bucket per request simply by rotating the header. The
// rightmost entry is the address the nearest trusted proxy actually saw.
//
// RATE_LIMIT_TRUSTED_PROXY_HOPS = how many trusted proxies sit between the
// client and this app and append to the header (default 1 — a single reverse
// proxy / platform edge). The client address is the Nth entry from the right.
const DEFAULT_TRUSTED_PROXY_HOPS = 1;

function trustedProxyHops(): number {
  const parsed = Number(process.env.RATE_LIMIT_TRUSTED_PROXY_HOPS);
  if (!Number.isFinite(parsed) || parsed < 1) return DEFAULT_TRUSTED_PROXY_HOPS;
  return Math.floor(parsed);
}

/**
 * Resolve the caller's address, or `null` when no proxy header is present
 * (direct connection, or a misconfigured proxy that forwards neither header).
 */
export function getClientIp(request: { headers: Headers }): string | null {
  // Set by the proxy itself and single-valued, so it cannot be appended to.
  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;

  const hops = (request.headers.get("x-forwarded-for") || "")
    .split(",")
    .map((hop) => hop.trim())
    .filter(Boolean);
  if (hops.length === 0) return null;

  const index = hops.length - trustedProxyHops();
  return hops[index] ?? hops[0];
}

// ── Declarative per-route rate-limit policies ───────────────────────────
// Single source of truth: routes name a policy instead of repeating a limit,
// a window and their own copy of the IP-extraction logic.
export type RateLimitScope = "ip" | "user";

export interface RateLimitPolicy {
  /** Requests allowed per window. */
  limit: number;
  windowMs: number;
  /** What the bucket is keyed by: caller address, or authenticated user id. */
  scope: RateLimitScope;
  /** Message returned on 429, in the `api-response` error shape. */
  message: string;
}

const POLICIES = {
  login: {
    limit: 10,
    windowMs: 60_000,
    scope: "ip",
    message: "Too many attempts. Please try again later.",
  },
  register: {
    limit: 5,
    windowMs: 60_000,
    scope: "ip",
    message: "Too many registration attempts. Please try again later.",
  },
  "forgot-password": {
    limit: 3,
    windowMs: 60_000,
    scope: "ip",
    message: "Too many requests. Please try again later.",
  },
  "reset-password": {
    limit: 5,
    windowMs: 60_000,
    scope: "ip",
    message: "Too many attempts. Please try again later.",
  },
  analytics: {
    limit: 60,
    windowMs: 60_000,
    scope: "ip",
    message: "Too many requests. Please try again later.",
  },
  "stellar-send": {
    limit: 20,
    windowMs: 60_000,
    scope: "user",
    message: "Too many send requests. Please try again later.",
  },
} as const;

export type RateLimitPolicyName = keyof typeof POLICIES;

export const RATE_LIMIT_POLICIES: Record<RateLimitPolicyName, RateLimitPolicy> =
  POLICIES;

// When no address can be resolved, all such callers share one bucket. That is
// deliberately fail-closed (better than handing every caller its own bucket and
// silently disabling the limit), but it also throttles unrelated callers, so
// surface it once per process instead of failing quietly.
const UNRESOLVED_IP = "unresolved";
let warnedAboutUnresolvedIp = false;

/**
 * Apply a named policy. Returns `null` when the request may proceed, or a ready
 * 429 response (api-response error shape + `Retry-After`) when it may not.
 *
 * `subject` is required for `user`-scoped policies and ignored otherwise.
 */
export function enforceRateLimit(
  request: { headers: Headers },
  policyName: RateLimitPolicyName,
  subject?: string | null
): NextResponse | null {
  const policy = RATE_LIMIT_POLICIES[policyName];

  let subjectKey: string;
  if (policy.scope === "user") {
    if (!subject) {
      throw new Error(
        `Rate-limit policy "${policyName}" is user-scoped but no subject was provided`
      );
    }
    subjectKey = `user:${subject}`;
  } else {
    const ip = getClientIp(request);
    if (!ip && !warnedAboutUnresolvedIp) {
      warnedAboutUnresolvedIp = true;
      logSecurityEvent("rate_limit_unresolved_ip", { endpoint: policyName });
    }
    subjectKey = `ip:${ip ?? UNRESOLVED_IP}`;
  }

  const result = rateLimit(
    `${policyName}:${subjectKey}`,
    policy.limit,
    policy.windowMs
  );
  if (result.allowed) return null;

  const retryAfterSeconds = Math.max(1, Math.ceil(result.retryAfterMs / 1000));
  logSecurityEvent("rate_limited", {
    endpoint: policyName,
    subject: subjectKey,
    retryAfterSeconds,
  });

  const response = errorResponse(policy.message, 429);
  response.headers.set("Retry-After", String(retryAfterSeconds));
  return response;
}

// ── CSRF token generation & validation ──────────────────────────────────
const CSRF_SECRET = process.env.CSRF_SECRET || "dev-csrf-secret-change-in-production";

export function generateCsrfToken(sessionId: string): string {
  const payload = `${sessionId}:${Date.now()}`;
  const signature = crypto
    .createHmac("sha256", CSRF_SECRET)
    .update(payload)
    .digest("hex");
  return `${Buffer.from(payload).toString("base64url")}.${signature}`;
}

export function validateCsrfToken(token: string, sessionId: string): boolean {
  try {
    const [encodedPayload, signature] = token.split(".");
    if (!encodedPayload || !signature) return false;

    const payload = Buffer.from(encodedPayload, "base64url").toString();
    const [tokenSessionId] = payload.split(":");
    if (tokenSessionId !== sessionId) return false;

    const expected = crypto
      .createHmac("sha256", CSRF_SECRET)
      .update(payload)
      .digest("hex");
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

// ── Input sanitization (XSS / prompt injection defense) ─────────────────
export function sanitizeInput(input: string, maxLength = 500): string {
  if (!input) return "";
  // Strip control characters and trim
  let cleaned = input.replace(/[\u0000-\u001F\u007F]/g, "").trim();
  // Limit length
  if (cleaned.length > maxLength) {
    cleaned = cleaned.slice(0, maxLength);
  }
  return cleaned;
}

export function sanitizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

// ── Prompt injection detection ──────────────────────────────────────────
const INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?(previous|prior|above|earlier)/i,
  /system\s*:\s*/i,
  /you\s+are\s+now\s+/i,
  /act\s+as\s+/i,
  /disregard\s+/i,
  /forget\s+(all\s+)?(previous|prior)/i,
  /<\|im_start\|>/i,
  /<\|im_end\|>/i,
  /jailbreak/i,
  /dan\s*=\s*/i,
];

export function detectPromptInjection(input: string): boolean {
  return INJECTION_PATTERNS.some((pattern) => pattern.test(input));
}

// ── Request size limiting ───────────────────────────────────────────────
export const MAX_REQUEST_SIZE = 100 * 1024; // 100KB

export async function readBodyWithLimit(request: NextRequest, maxBytes = MAX_REQUEST_SIZE): Promise<unknown> {
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > maxBytes) {
    throw new Error("Request body too large");
  }
  const text = await request.text();
  if (text.length > maxBytes) {
    throw new Error("Request body too large");
  }
  return JSON.parse(text);
}

// ── Security event logging ──────────────────────────────────────────────
export type SecurityEventType =
  | "login_success"
  | "login_failed"
  | "login_locked"
  | "register"
  | "logout"
  | "password_change"
  | "password_reset_request"
  | "password_reset_complete"
  | "csrf_blocked"
  | "rate_limited"
  | "rate_limit_unresolved_ip"
  | "invalid_token"
  | "unauthorized_access"
  | "upload_blocked"
  | "prompt_injection_blocked";

export function logSecurityEvent(
  type: SecurityEventType,
  details: Record<string, unknown> = {}
): void {
  const entry = {
    type,
    ts: new Date().toISOString(),
    ...details,
  };
  // In production, send to a logging service (Sentry, Datadog, etc.)
  console.log(`[SECURITY] ${JSON.stringify(entry)}`);
}

// ── Account lockout ─────────────────────────────────────────────────────
const loginAttempts = new Map<string, { count: number; lockedUntil: number }>();
export const MAX_LOGIN_ATTEMPTS = 5;
export const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes

export function checkAccountLockout(identifier: string): { locked: boolean; retryAfterMs: number } {
  const record = loginAttempts.get(identifier);
  if (!record) return { locked: false, retryAfterMs: 0 };
  if (record.lockedUntil > Date.now()) {
    return { locked: true, retryAfterMs: record.lockedUntil - Date.now() };
  }
  // Lockout expired, reset
  loginAttempts.delete(identifier);
  return { locked: false, retryAfterMs: 0 };
}

export function recordFailedLogin(identifier: string): { locked: boolean; retryAfterMs: number } {
  const record = loginAttempts.get(identifier) || { count: 0, lockedUntil: 0 };
  record.count += 1;
  if (record.count >= MAX_LOGIN_ATTEMPTS) {
    record.lockedUntil = Date.now() + LOCKOUT_DURATION_MS;
    record.count = 0;
    logSecurityEvent("login_locked", { identifier });
  }
  loginAttempts.set(identifier, record);
  return checkAccountLockout(identifier);
}

export function resetLoginAttempts(identifier: string): void {
  loginAttempts.delete(identifier);
}

// ── Upload type whitelist ───────────────────────────────────────────────
export const ALLOWED_UPLOAD_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
  "text/plain",
]);

export const MAX_UPLOAD_SIZE = 5 * 1024 * 1024; // 5MB

export function validateUpload(
  mimeType: string,
  size: number
): { valid: boolean; reason?: string } {
  if (!ALLOWED_UPLOAD_TYPES.has(mimeType)) {
    return { valid: false, reason: `File type ${mimeType} is not allowed` };
  }
  if (size > MAX_UPLOAD_SIZE) {
    return { valid: false, reason: "File exceeds 5MB limit" };
  }
  return { valid: true };
}

// ── CORS lockdown ───────────────────────────────────────────────────────
export const ALLOWED_ORIGINS = new Set([
  "https://remitx.app",
  "http://localhost:3000",
  "http://localhost:3001",
]);

export function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return false;
  return ALLOWED_ORIGINS.has(origin);
}

export function applySecurityHeaders(response: NextResponse): NextResponse {
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  response.headers.set("X-XSS-Protection", "1; mode=block");
  response.headers.set("Cross-Origin-Opener-Policy", "same-origin");
  response.headers.set("Cross-Origin-Resource-Policy", "same-origin");
  return response;
}

// ── Password reset token ────────────────────────────────────────────────
export function generateResetToken(userId: string): { token: string; expiresAt: number } {
  const expiresAt = Date.now() + 60 * 60 * 1000; // 1 hour
  const payload = `${userId}:${expiresAt}`;
  const signature = crypto
    .createHmac("sha256", CSRF_SECRET)
    .update(payload)
    .digest("hex");
  return {
    token: `${Buffer.from(payload).toString("base64url")}.${signature}`,
    expiresAt,
  };
}

export function validateResetToken(token: string): { userId: string; expiresAt: number } | null {
  try {
    const [encodedPayload, signature] = token.split(".");
    if (!encodedPayload || !signature) return null;

    const payload = Buffer.from(encodedPayload, "base64url").toString();
    const [userId, expiresAtStr] = payload.split(":");
    const expiresAt = Number(expiresAtStr);

    if (!userId || !expiresAt || expiresAt < Date.now()) return null;

    const expected = crypto
      .createHmac("sha256", CSRF_SECRET)
      .update(payload)
      .digest("hex");
    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
      return null;
    }

    return { userId, expiresAt };
  } catch {
    return null;
  }
}