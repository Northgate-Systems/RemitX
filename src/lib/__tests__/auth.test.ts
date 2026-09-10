import { describe, it, expect, vi, beforeEach } from "vitest";
import jsonwebtoken from "jsonwebtoken";
import type { User } from "@/lib/types";

const { mockCookieGet, mockCookieSet, mockFrom, mockSingle, mockEq, mockSelect } = vi.hoisted(() => ({
  mockCookieGet: vi.fn(),
  mockCookieSet: vi.fn(),
  mockFrom: vi.fn(),
  mockSingle: vi.fn(),
  mockEq: vi.fn(),
  mockSelect: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: mockCookieGet,
    set: mockCookieSet,
  })),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: { from: mockFrom },
}));

import {
  hashPassword,
  verifyPassword,
  signToken,
  verifyToken,
  setSessionCookie,
  clearSessionCookie,
  getCurrentUser,
  toSafeUser,
} from "../auth";

const SECRET = process.env.JWT_SECRET || "dev-jwt-secret-change-in-production-min-32-chars-long";

function fakeUserRow(overrides: Partial<User> = {}): User {
  return {
    id: "user-1",
    email: "user@example.com",
    firstName: "Peter",
    lastName: "Okoye",
    passwordHash: "hashed-secret",
    stellarPublicKey: null,
    kycStatus: "pending",
    sessionVersion: 1,
    failedLoginAttempts: 0,
    lockedUntil: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function makeSupabaseChain(userRow: unknown) {
  mockSelect.mockReturnValue({ eq: mockEq });
  mockEq.mockReturnValue({ single: mockSingle });
  mockSingle.mockResolvedValue({ data: userRow, error: userRow ? null : new Error("not found") });
  mockFrom.mockReturnValue({ select: mockSelect });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockCookieGet.mockReturnValue(undefined);
});

describe("hashPassword / verifyPassword", () => {
  it("hashes a password and verifies the same password against it", async () => {
    const hash = await hashPassword("Str0ngPass!");

    expect(hash).not.toBe("Str0ngPass!");
    expect(await verifyPassword("Str0ngPass!", hash)).toBe(true);
  });

  it("rejects a wrong password against a real hash", async () => {
    const hash = await hashPassword("Str0ngPass!");

    expect(await verifyPassword("WrongPass!", hash)).toBe(false);
  });
});

describe("signToken / verifyToken", () => {
  const safeUser = toSafeUser(fakeUserRow());

  it("round-trips sub, email, and sessionVersion", () => {
    const token = signToken(safeUser, 3);

    expect(verifyToken(token)).toEqual({ sub: "user-1", email: "user@example.com", sv: 3 });
  });

  it("defaults sessionVersion to 1 when not passed to signToken", () => {
    const token = signToken(safeUser);

    expect(verifyToken(token)?.sv).toBe(1);
  });

  it("defaults sv to 1 on verify for a token that never had an sv claim", () => {
    const token = jsonwebtoken.sign({ sub: "user-1", email: "user@example.com" }, SECRET);

    expect(verifyToken(token)).toEqual({ sub: "user-1", email: "user@example.com", sv: 1 });
  });

  it("rejects an expired token", () => {
    const token = jsonwebtoken.sign({ sub: "user-1", email: "user@example.com" }, SECRET, {
      expiresIn: -1,
    });

    expect(verifyToken(token)).toBeNull();
  });

  it("rejects a token signed with a different secret", () => {
    const token = jsonwebtoken.sign({ sub: "user-1", email: "user@example.com" }, "some-other-secret");

    expect(verifyToken(token)).toBeNull();
  });

  it("rejects a tampered token (payload modified after signing)", () => {
    const token = signToken(safeUser);
    const [header, , signature] = token.split(".");
    const tamperedPayload = Buffer.from(
      JSON.stringify({ sub: "attacker", email: "attacker@example.com", sv: 1 })
    ).toString("base64url");

    expect(verifyToken(`${header}.${tamperedPayload}.${signature}`)).toBeNull();
  });

  it("rejects garbage input instead of throwing", () => {
    expect(verifyToken("not-a-jwt-at-all")).toBeNull();
    expect(verifyToken("")).toBeNull();
  });
});

describe("toSafeUser", () => {
  it("strips passwordHash and keeps everything else", () => {
    const row = fakeUserRow();

    const safe = toSafeUser(row);

    expect(safe).not.toHaveProperty("passwordHash");
    expect(safe.id).toBe(row.id);
    expect(safe.email).toBe(row.email);
  });
});

describe("getCurrentUser", () => {
  it("returns null when there is no session cookie", async () => {
    mockCookieGet.mockReturnValue(undefined);

    expect(await getCurrentUser()).toBeNull();
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("returns null for an invalid/expired token without touching the database", async () => {
    mockCookieGet.mockReturnValue({ value: "garbage-token" });

    expect(await getCurrentUser()).toBeNull();
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("returns null when the token's user id doesn't exist in the database", async () => {
    const token = signToken(toSafeUser(fakeUserRow()), 1);
    mockCookieGet.mockReturnValue({ value: token });
    makeSupabaseChain(null);

    expect(await getCurrentUser()).toBeNull();
  });

  it("returns the safe user (no passwordHash) for a valid token matching the current session version", async () => {
    const row = fakeUserRow({ sessionVersion: 2 });
    const token = signToken(toSafeUser(row), 2);
    mockCookieGet.mockReturnValue({ value: token });
    makeSupabaseChain(row);

    const user = await getCurrentUser();

    expect(user).not.toBeNull();
    expect(user).not.toHaveProperty("passwordHash");
    expect(user?.id).toBe("user-1");
  });

  // This is exactly the check src/lib/jwt.ts's verifyToken can't perform
  // (see jwt.test.ts) - a token signed before a password change carries the
  // OLD session version, and a real password-change flow bumps
  // sessionVersion in the database. getCurrentUser() is the one place that
  // actually rejects it.
  it("returns null when the token's session version no longer matches the user's current one (password changed since)", async () => {
    const row = fakeUserRow({ sessionVersion: 5 }); // password changed after this token was issued
    const staleToken = signToken(toSafeUser(row), 1);
    mockCookieGet.mockReturnValue({ value: staleToken });
    makeSupabaseChain(row);

    expect(await getCurrentUser()).toBeNull();
  });

  it("treats a missing sessionVersion column as version 1 (backward compatible with an unmigrated table)", async () => {
    const row = fakeUserRow();
    delete (row as Record<string, unknown>).sessionVersion;
    const token = signToken(toSafeUser(fakeUserRow()), 1);
    mockCookieGet.mockReturnValue({ value: token });
    makeSupabaseChain(row);

    expect(await getCurrentUser()).not.toBeNull();
  });
});

describe("setSessionCookie / clearSessionCookie", () => {
  it("sets the session cookie with httpOnly/sameSite=strict and a 7-day maxAge", async () => {
    await setSessionCookie("some.jwt.token");

    expect(mockCookieSet).toHaveBeenCalledWith(
      "remitx_session",
      "some.jwt.token",
      expect.objectContaining({
        httpOnly: true,
        sameSite: "strict",
        path: "/",
        maxAge: 60 * 60 * 24 * 7,
      })
    );
  });

  it("clears the session cookie with maxAge 0", async () => {
    await clearSessionCookie();

    expect(mockCookieSet).toHaveBeenCalledWith(
      "remitx_session",
      "",
      expect.objectContaining({ maxAge: 0 })
    );
  });
});
