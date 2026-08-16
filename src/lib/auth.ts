import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { cookies } from "next/headers";
import { supabase } from "./supabase";
import type { User } from "./types";
import { logSecurityEvent } from "./security";

const JWT_SECRET = process.env.JWT_SECRET || "dev-jwt-secret-change-in-production-min-32-chars-long";
const SESSION_COOKIE = "remitx_session";
const SALT_ROUNDS = 12;

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
    JWT_SECRET,
    { expiresIn: "7d" }
  );
}

/** Verify and decode a JWT */
export function verifyToken(token: string): { sub: string; email: string; sv: number } | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { sub: string; email: string; sv?: number };
    return { sub: decoded.sub, email: decoded.email, sv: decoded.sv || 1 };
  } catch {
    return null;
  }
}

/** Set the session cookie with secure flags */
export async function setSessionCookie(token: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 60 * 60 * 24 * 7, // 7 days
  });
}

/** Clear the session cookie */
export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });
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
  const userRow = user as User;
  const currentSessionVersion = userRow.sessionVersion || 1;
  if (payload.sv !== currentSessionVersion) {
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