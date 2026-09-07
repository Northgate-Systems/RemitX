import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { logger } from "../logger";

describe("logger", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function lastLine(spy: ReturnType<typeof vi.spyOn>) {
    const calls = spy.mock.calls;
    return calls[calls.length - 1][0] as string;
  }

  it("emits a single JSON line for info()", () => {
    logger.info("user.login", { userId: "abc123" });

    expect(logSpy).toHaveBeenCalledTimes(1);
    const parsed = JSON.parse(lastLine(logSpy));
    expect(parsed.level).toBe("info");
    expect(parsed.msg).toBe("user.login");
    expect(parsed.userId).toBe("abc123");
    expect(typeof parsed.ts).toBe("string");
    // ts must be a real, parseable ISO timestamp
    expect(Number.isNaN(new Date(parsed.ts).getTime())).toBe(false);
  });

  it("routes warn() through console.warn, not console.log", () => {
    logger.warn("rates.fallback_used", { from: "XLM", to: "USD" });

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(logSpy).not.toHaveBeenCalled();
    const parsed = JSON.parse(lastLine(warnSpy));
    expect(parsed.level).toBe("warn");
    expect(parsed.from).toBe("XLM");
  });

  it("routes error() through console.error, not console.log", () => {
    logger.error("stellar_send.error", { userId: "u1" });

    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(logSpy).not.toHaveBeenCalled();
    const parsed = JSON.parse(lastLine(errorSpy));
    expect(parsed.level).toBe("error");
  });

  it("expands an Error instance into a plain, JSON-serializable object", () => {
    const err = new Error("boom");
    logger.error("stellar_send.error", { err });

    const parsed = JSON.parse(lastLine(errorSpy));
    // A bare Error would JSON.stringify to "{}" - message/stack are
    // non-enumerable on Error.prototype. Confirm we actually captured them.
    expect(parsed.err.message).toBe("boom");
    expect(parsed.err.name).toBe("Error");
    expect(typeof parsed.err.stack).toBe("string");
  });

  it("passes through non-Error values (e.g. a Supabase-style error object) untouched", () => {
    const supabaseError = { message: "duplicate key", code: "23505" };
    logger.error("db.insert_error", { err: supabaseError });

    const parsed = JSON.parse(lastLine(errorSpy));
    expect(parsed.err).toEqual(supabaseError);
  });

  it("never throws when called with no extra fields", () => {
    expect(() => logger.info("noop")).not.toThrow();
    const parsed = JSON.parse(lastLine(logSpy));
    expect(parsed.msg).toBe("noop");
  });

  it("produces valid, single-line JSON (no embedded raw newlines from the message)", () => {
    logger.info("multi\nline\nmsg");
    const line = lastLine(logSpy);
    // JSON.stringify escapes \n as \\n, so the actual string has no raw
    // newline characters even though the source msg did.
    expect(line.includes("\n")).toBe(false);
    expect(() => JSON.parse(line)).not.toThrow();
  });
});
