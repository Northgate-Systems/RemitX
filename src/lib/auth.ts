import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { cookies } from "next/headers";
import { supabase } from "./supabase";
import type { User } from "./types";
import { logSecurityEvent } from "./security";
import { getJwtSecret, JWT_ALGORITHM, SESSION_COOKIE } from "./jwt";

export { SESSION_COOKIE };
/** Session cookie lifetime, kept in sync with the JWT's own expiry below. */
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 days
const SESSION_EXPIRES_IN = "7d";
const SALT_ROUNDS = 12;

/**
 * Single source of truth for the session cookie's attributes.
 *
 * Both setting and clearing the cookie must use the exact same attributes:
 * a browser only overwrites a cookie when name/path/domain match, so a
 * logout that dropped `path` here would leave the old session cookie in
 * place. `secure` stays off outside production so http://localhost works.
 */
export function sessionCookieOptions(maxAge: number = SESSION_MAX_AGE_SECONDS) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict" as const,
    path: "/",
    maxAge,
  };
}

export type SafeUser = Omit<User, "passwordHash">;

/** Hash a plaintext password */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

/** Compare a plaintext password against a hash */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/** Generate a JWT for a user with session version for invalidation on password change */
export function signToken(user: SafeUser, sessionVersion = 1): string {
  return jwt.sign(
    { sub: user.id, email: user.email, sv: sessionVersion },
    getJwtSecret(),
    { expiresIn: SESSION_EXPIRES_IN, algorithm: JWT_ALGORITHM }
  );
}

/** Verify and decode a JWT */
export function verifyToken(token: string): { sub: string; email: string; sv: number } | null {
  try {
    const decoded = jwt.verify(token, getJwtSecret(), {
      algorithms: [JWT_ALGORITHM],
    }) as { sub: string; email: string; sv?: number };
    return { sub: decoded.sub, email: decoded.email, sv: decoded.sv || 1 };
  } catch {
    return null;
  }
}

/** Set the session cookie with secure flags */
export async function setSessionCookie(token: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, sessionCookieOptions());
}

/** Clear the session cookie */
export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, "", sessionCookieOptions(0));
}

/** Get the current user from the session cookie */
export async function getCurrentUser(): Promise<SafeUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const payload = verifyToken(token);
  if (!payload) return null;

  const { data: user, error } = await supabase
    .from("users")
    .select("*")
    .eq("id", payload.sub)
    .single();
  if (error || !user) return null;

  // Check session version - if password was changed, invalidate old sessions
  // (column may not exist on old schema - default to 1)
  const userRow = user as User;
  const currentSessionVersion = (userRow as Record<string, unknown>).sessionVersion as number | undefined;
  if (payload.sv !== (currentSessionVersion || 1)) {
    logSecurityEvent("invalid_token", { userId: payload.sub, reason: "session_version_mismatch" });
    return null;
  }

  const { passwordHash: _, ...safeUser } = userRow;
  return safeUser;
}

/** Strip password hash from user object */
export function toSafeUser(user: User): SafeUser {
  const { passwordHash: _, ...safeUser } = user;
  return safeUser;
}