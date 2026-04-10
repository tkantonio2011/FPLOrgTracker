/**
 * Edge-runtime-safe auth helpers.
 * Uses the Web Crypto API (globalThis.crypto.subtle) — no Node.js built-ins.
 * Tokens produced by auth.ts (Node HMAC-SHA256) are fully compatible.
 */

export const USER_COOKIE_NAME = "user_session";

function secret(): string {
  return process.env.SESSION_SECRET ?? process.env.ADMIN_PIN ?? "dev-session-secret";
}

function hexToBytes(hex: string): Uint8Array<ArrayBuffer> {
  const buf   = new ArrayBuffer(hex.length / 2);
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}

/** Verifies a session token (built by auth.ts) and returns the managerId, or null. */
export async function parseUserTokenEdge(token: string): Promise<number | null> {
  try {
    // base64url → string
    const decoded  = atob(token.replace(/-/g, "+").replace(/_/g, "/"));
    const colonIdx = decoded.indexOf(":");
    if (colonIdx === -1) return null;

    const managerIdStr = decoded.slice(0, colonIdx);
    const sigHex       = decoded.slice(colonIdx + 1);

    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      enc.encode(secret()),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );

    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      hexToBytes(sigHex),
      enc.encode(managerIdStr),
    );

    if (!valid) return null;
    const id = parseInt(managerIdStr, 10);
    return Number.isFinite(id) ? id : null;
  } catch {
    return null;
  }
}
