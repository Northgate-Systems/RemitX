import { describe, it, expect } from "vitest";
import jsonwebtoken from "jsonwebtoken";
import { verifyToken } from "../jwt";

// Matches the fallback in src/lib/jwt.ts (and src/lib/auth.ts) exactly -
// both read JWT_SECRET the same way, so a real deployment always has both
// files agreeing on the secret even though process.env.JWT_SECRET isn't
// set here in tests.
const SECRET = process.env.JWT_SECRET || "dev-jwt-secret-change-in-production-min-32-chars-long";

function sign(payload: object, options: jsonwebtoken.SignOptions = {}) {
  return jsonwebtoken.sign(payload, SECRET, options);
}

describe("jwt.ts verifyToken", () => {
  it("accepts a validly signed token and returns its claims", () => {
    const token = sign({ sub: "user-1", email: "user@example.com" });

    const payload = verifyToken(token);

    expect(payload).toMatchObject({ sub: "user-1", email: "user@example.com" });
  });

  it("rejects an expired token", () => {
    const token = sign({ sub: "user-1", email: "user@example.com" }, { expiresIn: -1 });

    expect(verifyToken(token)).toBeNull();
  });

  it("rejects a token signed with a different secret", () => {
    const token = jsonwebtoken.sign({ sub: "user-1", email: "user@example.com" }, "some-other-secret");

    expect(verifyToken(token)).toBeNull();
  });

  it("rejects a tampered token (payload modified after signing)", () => {
    const token = sign({ sub: "user-1", email: "user@example.com" });
    const [header, , signature] = token.split(".");
    const tamperedPayload = Buffer.from(
      JSON.stringify({ sub: "attacker", email: "attacker@example.com" })
    ).toString("base64url");
    const tampered = `${header}.${tamperedPayload}.${signature}`;

    expect(verifyToken(tampered)).toBeNull();
  });

  it("rejects garbage input instead of throwing", () => {
    expect(verifyToken("not-a-jwt-at-all")).toBeNull();
    expect(verifyToken("")).toBeNull();
  });

  // src/lib/auth.ts has its OWN verifyToken against the same secret, and
  // that one explicitly extracts a session-version claim (sv) so
  // getCurrentUser() can invalidate old sessions after a password change.
  // This function's return type - { sub: string; email: string } - looks
  // like it drops that field, but jwt.verify() actually returns the full
  // decoded payload at runtime; the type is just a cast, not a filter.
  // The real gap: middleware.ts (the only caller of *this* verifyToken)
  // never reads payload.sv because its own declared type says it isn't
  // there, so a stale-session-version token still sails through the
  // middleware gate for page routes even though the same token would be
  // rejected by getCurrentUser() for API routes. Not fixing that here (see
  // PR description) - this test pins down that sv really is present on
  // the object jwt.ts hands back, so "the type just doesn't mention it"
  // doesn't quietly turn into "backfilled to undefined" if either
  // implementation changes later.
  it("returns sv on the raw object even though the declared return type omits it", () => {
    const token = sign({ sub: "user-1", email: "user@example.com", sv: 4 });

    const payload = verifyToken(token) as Record<string, unknown> | null;

    expect(payload).not.toBeNull();
    expect(payload?.sv).toBe(4);
  });
});
