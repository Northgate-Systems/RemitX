import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { logSecurityEvent as logSecurityEventNode } from "../security";
import { logSecurityEvent as logSecurityEventEdge } from "../security-edge";

describe("logSecurityEvent (structured JSON, no more '[SECURITY] ' string prefix)", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("(node) emits pure JSON with no leading '[SECURITY]' text", () => {
    logSecurityEventNode("login_success", { userId: "u1" });

    expect(logSpy).toHaveBeenCalledTimes(1);
    const line = logSpy.mock.calls[0][0] as string;
    expect(line.startsWith("[SECURITY]")).toBe(false);
    const parsed = JSON.parse(line);
    expect(parsed.type).toBe("login_success");
    expect(parsed.userId).toBe("u1");
    expect(parsed.level).toBe("info");
  });

  it("(node) routes blockable events to warn level", () => {
    logSecurityEventNode("csrf_blocked", { ip: "1.2.3.4" });

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(logSpy).not.toHaveBeenCalled();
    const parsed = JSON.parse(warnSpy.mock.calls[0][0] as string);
    expect(parsed.level).toBe("warn");
    expect(parsed.type).toBe("csrf_blocked");
  });

  it("(node) routes routine audit events to info level", () => {
    for (const type of ["login_success", "register", "logout", "password_change", "password_reset_complete"] as const) {
      logSpy.mockClear();
      warnSpy.mockClear();
      logSecurityEventNode(type, {});
      expect(logSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy).not.toHaveBeenCalled();
    }
  });

  it("(edge) emits pure JSON with no leading '[SECURITY]' text, and shares the same warn/info split as the node version", () => {
    logSecurityEventEdge("rate_limited", { ip: "5.6.7.8", endpoint: "analytics" });

    // rate_limited is a "blockable" event - same WARN_SECURITY_EVENT_TYPES
    // set the node version uses, so it must land on console.warn here too.
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(logSpy).not.toHaveBeenCalled();
    const line = warnSpy.mock.calls[0][0] as string;
    expect(line.startsWith("[SECURITY]")).toBe(false);
    const parsed = JSON.parse(line);
    expect(parsed.type).toBe("rate_limited");
    expect(parsed.endpoint).toBe("analytics");
  });

  it("(edge) still logs routine events (e.g. a custom non-blockable type) at info", () => {
    logSecurityEventEdge("something_routine", {});
    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).not.toHaveBeenCalled();
  });
});
