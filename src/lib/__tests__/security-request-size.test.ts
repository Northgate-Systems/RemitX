import { describe, it, expect } from "vitest";
import { readBodyWithLimit, isBodyTooLargeError, MAX_REQUEST_SIZE } from "../security";
import type { NextRequest } from "next/server";

function makeRequest(bodyText: string, contentLength?: number): NextRequest {
  const headers: Record<string, string> = {};
  if (contentLength !== undefined) {
    headers["content-length"] = String(contentLength);
  }
  return new Request("http://localhost/api/whatever", {
    method: "POST",
    headers,
    body: bodyText,
  }) as unknown as NextRequest;
}

describe("readBodyWithLimit", () => {
  it("parses and returns the JSON body when it is under the limit", async () => {
    const payload = { hello: "world" };
    const request = makeRequest(JSON.stringify(payload), JSON.stringify(payload).length);

    await expect(readBodyWithLimit(request)).resolves.toEqual(payload);
  });

  it("rejects a request whose Content-Length header alone already exceeds the limit", async () => {
    // A tiny actual body, but a lying/oversized Content-Length header -
    // this must be rejected before the body is even read.
    const request = makeRequest("{}", MAX_REQUEST_SIZE + 1);

    await expect(readBodyWithLimit(request)).rejects.toThrow("Request body too large");
  });

  it("rejects an oversized body even when Content-Length is missing or understated", async () => {
    const oversized = JSON.stringify({ padding: "a".repeat(MAX_REQUEST_SIZE + 1) });
    // No content-length header supplied - relies purely on the actual-length check.
    const request = makeRequest(oversized);

    await expect(readBodyWithLimit(request)).rejects.toThrow("Request body too large");
  });

  it("honors a custom maxBytes override", async () => {
    const body = JSON.stringify({ a: 1 });
    const request = makeRequest(body, body.length);

    await expect(readBodyWithLimit(request, 4)).rejects.toThrow("Request body too large");
  });
});

describe("isBodyTooLargeError", () => {
  it("returns true for the exact error readBodyWithLimit throws", () => {
    expect(isBodyTooLargeError(new Error("Request body too large"))).toBe(true);
  });

  it("returns false for unrelated errors", () => {
    expect(isBodyTooLargeError(new Error("Invalid recipient"))).toBe(false);
  });

  it("returns false for non-Error values", () => {
    expect(isBodyTooLargeError("Request body too large")).toBe(false);
    expect(isBodyTooLargeError(undefined)).toBe(false);
  });
});
