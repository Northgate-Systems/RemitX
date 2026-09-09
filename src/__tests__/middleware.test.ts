import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/jwt", () => ({
  verifyToken: vi.fn(),
}));

vi.mock("@/lib/security-edge", () => ({
  applySecurityHeaders: vi.fn((response) => response),
  logSecurityEvent: vi.fn(),
}));

import { middleware } from "../middleware";
import { verifyToken } from "@/lib/jwt";

function makeRequest(path: string, cookie?: string) {
  return new NextRequest(`http://localhost:3000${path}`, {
    headers: cookie ? { cookie } : {},
  });
}

describe("middleware session-expiry redirect", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects to /login?expired=1 (not a bare /login) when a protected page has no session cookie", () => {
    const res = middleware(makeRequest("/dashboard"));
    expect(res.status).toBe(307);
    const location = res.headers.get("location");
    expect(location).not.toBeNull();
    const url = new URL(location as string);
    expect(url.pathname).toBe("/login");
    expect(url.searchParams.get("expired")).toBe("1");
  });

  it("redirects to /login?expired=1 when the session cookie fails verification", () => {
    vi.mocked(verifyToken).mockReturnValue(null);
    const res = middleware(makeRequest("/dashboard", "remitx_session=garbage"));
    expect(res.status).toBe(307);
    const url = new URL(res.headers.get("location") as string);
    expect(url.searchParams.get("expired")).toBe("1");
  });

  it("does not redirect (passes through) when the session is valid", () => {
    vi.mocked(verifyToken).mockReturnValue({ sub: "user-1", email: "a@b.com" });
    const res = middleware(makeRequest("/dashboard", "remitx_session=valid-token"));
    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
  });

  it("returns a plain 401 (no redirect) for API routes with no session, so callers don't need to follow a redirect", () => {
    const res = middleware(makeRequest("/api/transactions"));
    expect(res.status).toBe(401);
    expect(res.headers.get("location")).toBeNull();
  });

  it("lets public paths like /login itself through without touching cookies", () => {
    const res = middleware(makeRequest("/login"));
    expect(res.status).toBe(200);
    expect(verifyToken).not.toHaveBeenCalled();
  });
});
