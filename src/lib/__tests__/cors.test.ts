import { describe, it, expect } from "vitest";
import { NextResponse } from "next/server";
import { withPublicCors, publicCorsPreflight, PUBLIC_CORS_HEADERS } from "../cors";

describe("withPublicCors", () => {
  it("attaches every header from PUBLIC_CORS_HEADERS to the given response", () => {
    const response = withPublicCors(NextResponse.json({ ok: true }));

    for (const [key, value] of Object.entries(PUBLIC_CORS_HEADERS)) {
      expect(response.headers.get(key)).toBe(value);
    }
  });

  it("preserves the original response status and body", async () => {
    const response = withPublicCors(NextResponse.json({ hello: "world" }, { status: 201 }));

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body).toEqual({ hello: "world" });
  });
});

describe("publicCorsPreflight", () => {
  it("returns a 204 response with an empty body and the CORS headers", async () => {
    const response = publicCorsPreflight();

    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    const text = await response.text();
    expect(text).toBe("");
  });
});
