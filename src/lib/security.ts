import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

/**
 * ── Security utilities for RemitX ────────────────────────────────────────
 * Centralizes rate limiting, CSRF, sanitization, request size limits,
 * security event logging, and account lockout.
 */

// ── In-memory rate limiter (per-process) ────────────────────────────────
// For production with multiple instances, replace with Redis/Upstash.
const rateBuckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number
): { allowed: boolean; retryAfterMs: number } {
  const now = Date.now();
  const bucket = rateBuckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    rateBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterMs: 0 };
  }

  if (bucket.count >= limit) {
    return { allowed: false, retryAfterMs: bucket.resetAt - now };
  }

  bucket.count += 1;
  return { allowed: true, retryAfterMs: 0 };
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