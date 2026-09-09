import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import jwt from "jsonwebtoken";

// next/headers is only available inside a Next request scope, so the cookie
// store is faked here and every `set()` call is captured for assertion.
const { cookieStore } = vi.hoisted(() => ({
  cookieStore: {
    set: vi.fn(),
    get: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("next/headers", () => ({
  cookies: async () => cookieStore,
}));

import {
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  sessionCookieOptions,
  setSessionCookie,
  clearSessionCookie,
  signToken,
  verifyToken,
  type SafeUser,
} from "@/lib/auth";
import {
  DEV_JWT_SECRET,
  JWT_ALGORITHM,
  getJwtSecret,
  verifyToken as verifyEdgeToken,
} from "@/lib/jwt";

const TEST_SECRET = "test-secret-at-least-32-characters-long!!";

const user = {
  id: "user-1",
  email: "ada@example.com",
} as unknown as SafeUser;

beforeEach(() => {
  cookieStore.set.mockClear();
  vi.stubEnv("JWT_SECRET", TEST_SECRET);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("session cookie flags", () => {
  it("sets the session cookie httpOnly, sameSite=strict, path=/ for 7 days", async () => {
    await setSessionCookie("token-value");

    expect(cookieStore.set).toHaveBeenCalledTimes(1);
    const [name, value, options] = cookieStore.set.mock.calls[0];
    expect(name).toBe(SESSION_COOKIE);
    expect(value).toBe("token-value");
    expect(options.httpOnly).toBe(true);
    expect(options.sameSite).toBe("strict");
    expect(options.path).toBe("/");
    expect(options.maxAge).toBe(SESSION_MAX_AGE_SECONDS);
  });

  it("marks the cookie secure in production and not outside it", async () => {
    vi.stubEnv("NODE_ENV", "production");
    await setSessionCookie("token-value");
    expect(cookieStore.set.mock.calls[0][2].secure).toBe(true);

    cookieStore.set.mockClear();
    vi.stubEnv("NODE_ENV", "development");
    await setSessionCookie("token-value");
    expect(cookieStore.set.mock.calls[0][2].secure).toBe(false);
  });

  it("clears the cookie with maxAge 0 and otherwise identical attributes", async () => {
    // A browser only overwrites a cookie when the attributes match, so if
    // logout ever drifted from setSessionCookie (a dropped `path`, a missing
    // `secure` in production) the old session cookie would survive logout.
    vi.stubEnv("NODE_ENV", "production");

    await setSessionCookie("token-value");
    const setOptions = { ...cookieStore.set.mock.calls[0][2] };
    cookieStore.set.mockClear();

    await clearSessionCookie();
    const [name, value, clearOptions] = cookieStore.set.mock.calls[0];

    expect(name).toBe(SESSION_COOKIE);
    expect(value).toBe("");
    expect(clearOptions.maxAge).toBe(0);
    delete setOptions.maxAge;
    expect({ ...clearOptions, maxAge: undefined }).toMatchObject(setOptions);
  });

  it("keeps the cookie lifetime in sync with the JWT expiry", () => {
    // A cookie outliving its token logs the user out with a broken session
    // instead of a clean redirect; a token outliving the cookie silently
    // shortens the advertised 7-day session.
    const decoded = jwt.decode(signToken(user)) as { iat: number; exp: number };
    expect(decoded.exp - decoded.iat).toBe(SESSION_MAX_AGE_SECONDS);
    expect(sessionCookieOptions().maxAge).toBe(SESSION_MAX_AGE_SECONDS);
  });
});

describe("signToken / verifyToken", () => {
  it("round-trips subject, email and session version", () => {
    const payload = verifyToken(signToken(user, 4));
    expect(payload).toEqual({ sub: user.id, email: user.email, sv: 4 });
  });

  it("defaults a legacy token without `sv` to session version 1", () => {
    const legacy = jwt.sign({ sub: user.id, email: user.email }, TEST_SECRET, {
      expiresIn: "7d",
      algorithm: JWT_ALGORITHM,
    });
    expect(verifyToken(legacy)?.sv).toBe(1);
  });

  it("rejects a token whose payload was tampered with", () => {
    const [header, , signature] = signToken(user).split(".");
    const forgedPayload = Buffer.from(
      JSON.stringify({ sub: "attacker", email: "mallory@example.com", sv: 1 })
    ).toString("base64url");

    expect(verifyToken(`${header}.${forgedPayload}.${signature}`)).toBeNull();
  });

  it("rejects a token signed with a different secret", () => {
    const foreign = jwt.sign({ sub: user.id, email: user.email, sv: 1 }, "some-other-secret", {
      expiresIn: "7d",
      algorithm: JWT_ALGORITHM,
    });
    expect(verifyToken(foreign)).toBeNull();
  });

  it("rejects an expired token", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const token = signToken(user);

    expect(verifyToken(token)).not.toBeNull();
    vi.setSystemTime(new Date("2026-01-08T00:00:01Z")); // 7 days + 1s
    expect(verifyToken(token)).toBeNull();
  });

  it("rejects a token signed with an algorithm the app does not use", () => {
    // Verifying without an `algorithms` allow-list lets an attacker pick the
    // algorithm the server validates under; pin it to the one we sign with.
    const hs512 = jwt.sign({ sub: user.id, email: user.email, sv: 1 }, TEST_SECRET, {
      expiresIn: "7d",
      algorithm: "HS512",
    });
    expect(verifyToken(hs512)).toBeNull();
    expect(verifyEdgeToken(hs512)).toBeNull();
  });

  it("rejects malformed input instead of throwing", () => {
    for (const bad of ["", "not-a-jwt", "a.b.c"]) {
      expect(verifyToken(bad)).toBeNull();
      expect(verifyEdgeToken(bad)).toBeNull();
    }
  });
});

describe("edge verifier (src/lib/jwt.ts) agrees with src/lib/auth.ts", () => {
  it("accepts in middleware exactly the token the login route issues", () => {
    // middleware.ts gates every private route with this verifier while the
    // routes themselves use auth.ts — the two must not drift apart.
    const payload = verifyEdgeToken(signToken(user, 2));
    expect(payload).toMatchObject({ sub: user.id, email: user.email });
  });
});

describe("getJwtSecret", () => {
  it("prefers JWT_SECRET from the environment", () => {
    expect(getJwtSecret()).toBe(TEST_SECRET);
  });

  it("falls back to the development secret outside production", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("JWT_SECRET", "");
    expect(getJwtSecret()).toBe(DEV_JWT_SECRET);
  });

  it("refuses the public development secret in production", () => {
    // The fallback is committed to a public repo: signing production
    // sessions with it means anyone can mint a valid session cookie.
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("JWT_SECRET", "");
    expect(() => getJwtSecret()).toThrow(/JWT_SECRET is not set/);
    expect(() => signToken(user)).toThrow(/JWT_SECRET is not set/);
  });

  it("returns null rather than throwing when verifying without a secret in production", () => {
    // A missing secret must not turn every authenticated request into a 500.
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("JWT_SECRET", "");
    expect(verifyToken("a.b.c")).toBeNull();
    expect(verifyEdgeToken("a.b.c")).toBeNull();
  });
});
