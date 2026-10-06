// Edge-safe JWT verification for `src/proxy.ts` (formerly `src/middleware.ts`).
//
// The proxy runs in a constrained runtime where Node-only packages such as
// `jsonwebtoken` (which pulls in `crypto`, `Buffer`, etc.) can fail or bloat
// the bundle. Session tokens are plain HS256 JWTs signed in `src/lib/auth.ts`
// with `jsonwebtoken`, so we verify the HMAC here with Web Crypto
// (`globalThis.crypto.subtle`), which is available in Edge, Node 18+, and
// Vercel's runtime.

const JWT_SECRET =
  process.env.JWT_SECRET || "dev-jwt-secret-change-in-production-min-32-chars-long";

function base64UrlDecode(input: string): Uint8Array {
  // Normalise base64url -> base64, then decode without relying on Buffer
  // (Buffer does not exist in the Edge runtime).
  const base64 = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function textToBytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

export interface SessionPayload {
  sub: string;
  email: string;
}

/**
 * Verify an HS256 session JWT. Returns the payload on success, `null` when
 * the token is missing, malformed, expired, or has a bad signature.
 *
 * Async because Web Crypto is promise-based. Callers (proxy) must `await` it.
 */
export async function verifyToken(token: string): Promise<SessionPayload | null> {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const [encodedHeader, encodedPayload, encodedSignature] = parts;

    const signingInput = `${encodedHeader}.${encodedPayload}`;
    const signatureBytes = base64UrlDecode(encodedSignature);

    const key = await globalThis.crypto.subtle.importKey(
      "raw",
      textToBytes(JWT_SECRET),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );

    const valid = await globalThis.crypto.subtle.verify(
      "HMAC",
      key,
      signatureBytes as unknown as BufferSource,
      textToBytes(signingInput) as unknown as BufferSource
    );
    if (!valid) return null;

    const payloadJson = new TextDecoder().decode(base64UrlDecode(encodedPayload));
    const payload = JSON.parse(payloadJson) as {
      sub?: unknown;
      email?: unknown;
      exp?: unknown;
    };

    if (typeof payload.sub !== "string" || typeof payload.email !== "string") {
      return null;
    }
    if (typeof payload.exp === "number" && payload.exp * 1000 < Date.now()) {
      return null;
    }

    return { sub: payload.sub, email: payload.email };
  } catch {
    return null;
  }
}
