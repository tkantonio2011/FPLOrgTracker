import { createHmac, randomBytes, scrypt, timingSafeEqual } from "crypto";
import { promisify } from "util";
import type { NextRequest } from "next/server";

const scryptAsync = promisify(scrypt);

// ── Cookie ────────────────────────────────────────────────────────────────────
export const USER_COOKIE_NAME  = "user_session";
export const USER_COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

function sessionSecret(): string {
  return process.env.SESSION_SECRET ?? process.env.ADMIN_PIN ?? "dev-session-secret";
}

// ── Password hashing (Node crypto.scrypt — no extra dependency) ───────────────

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derived = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${salt}:${derived.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const derived = (await scryptAsync(password, salt, 64)) as Buffer;
  const storedBuf = Buffer.from(hash, "hex");
  if (derived.length !== storedBuf.length) return false;
  return timingSafeEqual(derived, storedBuf);
}

// ── Session tokens ─────────────────────────────────────────────────────────────
// Token = base64( managerId + ":" + hmac )
// Deterministic per managerId + secret — simple and no DB lookup needed.

export function buildUserToken(managerId: number): string {
  const sig = createHmac("sha256", sessionSecret())
    .update(String(managerId))
    .digest("hex");
  return Buffer.from(`${managerId}:${sig}`).toString("base64url");
}

export function parseUserToken(token: string): number | null {
  try {
    const decoded  = Buffer.from(token, "base64url").toString("utf8");
    const colonIdx = decoded.indexOf(":");
    if (colonIdx === -1) return null;
    const managerIdStr = decoded.slice(0, colonIdx);
    const sig          = decoded.slice(colonIdx + 1);
    const expected     = createHmac("sha256", sessionSecret())
      .update(managerIdStr)
      .digest("hex");
    const sigBuf      = Buffer.from(sig,      "hex");
    const expectedBuf = Buffer.from(expected, "hex");
    if (sigBuf.length !== expectedBuf.length) return null;
    if (!timingSafeEqual(sigBuf, expectedBuf)) return null;
    const managerId = parseInt(managerIdStr, 10);
    return Number.isFinite(managerId) ? managerId : null;
  } catch {
    return null;
  }
}

/** Returns the authenticated managerId from the request cookie, or null. */
export function getSessionManagerId(req: NextRequest): number | null {
  const token = req.cookies.get(USER_COOKIE_NAME)?.value;
  if (!token) return null;
  return parseUserToken(token);
}
