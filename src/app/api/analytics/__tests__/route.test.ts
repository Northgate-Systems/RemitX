import { describe, it, expect } from "vitest";
import { POST } from "../route";
import { MAX_REQUEST_SIZE } from "@/lib/security";

let ipCounter = 0;

function makeRequest(bodyText: string, contentLength?: number) {
  // Each test uses its own x-forwarded-for so the shared in-memory rate
  // limiter never trips between assertions in this file.
  ipCounter += 1;
  const headers: Record<string, string> = { "x-forwarded-for": `10.0.0.${ipCounter}` };
  if (contentLength !== undefined) {
    headers["content-length"] = String(contentLength);
  }
  return new Request("http://localhost/api/analytics", {
    method: "POST",
    headers,
    body: bodyText,
  }) as never;
}

describe("POST /api/analytics", () => {
  it("accepts a small, well-formed pageview payload", async () => {
    const body = JSON.stringify({ url: "/dashboard", referrer: "/login", ts: 12345 });
    const response = await POST(makeRequest(body, body.length));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });
  });

  it("rejects a request body larger than the configured limit with 413, before parsing it as JSON", async () => {
    const oversized = JSON.stringify({ url: "a".repeat(MAX_REQUEST_SIZE + 1) });
    const response = await POST(makeRequest(oversized, oversized.length));

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({ success: false });
  });

  it("rejects a request whose Content-Length header lies above the limit, without reading the body", async () => {
    const response = await POST(makeRequest("{}", MAX_REQUEST_SIZE + 1));

    expect(response.status).toBe(413);
  });

  it("still returns 400 (not 413/500) for a body that is small but not valid JSON", async () => {
    const response = await POST(makeRequest("not json", 8));

    expect(response.status).toBe(400);
  });
});
