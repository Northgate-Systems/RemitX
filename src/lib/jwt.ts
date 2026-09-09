// Pure JWT utilities for middleware (no Prisma/Supabase dependency)
import jwt from "jsonwebtoken";

/**
 * Fallback secret used only outside production so a fresh checkout runs
 * without any .env at all. It is committed to a public repo, so anyone can
 * forge a session token with it — `getJwtSecret()` therefore refuses to hand
 * it out when NODE_ENV === "production".
 */
export const DEV_JWT_SECRET =
  "dev-jwt-secret-change-in-production-min-32-chars-long";

/** The algorithm this app signs with. Pinned on verify so a token can never
 *  be accepted under an algorithm we did not choose. */
export const JWT_ALGORITHM = "HS256" as const;

/** Name of the session cookie. Lives here (not in auth.ts) so middleware,
 *  which cannot import the Supabase-backed auth module, shares one literal. */
export const SESSION_COOKIE = "remitx_session";

/**
 * Read JWT_SECRET at call time (not module load) so the value cannot be
 * baked in before the environment is populated, and so tests can vary it.
 */
export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (secret) return secret;

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "[auth] JWT_SECRET is not set. Refusing to sign or verify sessions with the public development secret in production — set JWT_SECRET (min 32 chars) in your host's environment."
    );
  }

  return DEV_JWT_SECRET;
}

export function verifyToken(token: string): { sub: string; email: string } | null {
  try {
    return jwt.verify(token, getJwtSecret(), {
      algorithms: [JWT_ALGORITHM],
    }) as { sub: string; email: string };
  } catch {
    return null;
  }
}
