/**
 * Magic-link tokens. Plaintext is delivered via email exactly once; only the
 * SHA-256 hash is stored. Single-use, time-limited.
 *
 * Sign-in tokens: 15-minute lifetime.
 * Invitation tokens: 7-day lifetime; bound to a specific Invitation row.
 *
 * Issuing a new sign-in token for an email invalidates any unused outstanding
 * sign-in tokens for the same address (delete-and-replace).
 *
 * Rate limit: 5/min and 30/hour per email; 20/min per IP. Tracked in process
 * memory — per-process buckets are sufficient for v1 (single Next.js server).
 * Move to a shared store (Redis/DB) when the deployment scales out.
 */

import { createHash, randomBytes } from "crypto";
import { db } from "@/lib/db";

export const SIGN_IN_TTL_MS = 15 * 60 * 1000; // 15 minutes
export const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

const HASH_ALGO = "sha256";

function hashToken(plaintext: string): string {
  return createHash(HASH_ALGO).update(plaintext).digest("hex");
}

function generatePlaintextToken(): string {
  return randomBytes(32).toString("base64url");
}

// ── Rate limiting ────────────────────────────────────────────────────────────

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

function check(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (existing.count >= limit) return false;
  existing.count += 1;
  return true;
}

/** Returns false if the request should be denied due to rate limit. */
export function checkSignInRateLimit(email: string, ip: string | null): { ok: true } | { ok: false; reason: string } {
  if (!check(`email:1m:${email}`, 5, 60_000))   return { ok: false, reason: "Too many requests for this email — please try again in a minute" };
  if (!check(`email:1h:${email}`, 30, 3_600_000)) return { ok: false, reason: "Too many requests for this email — please try again later" };
  if (ip && !check(`ip:1m:${ip}`, 20, 60_000))   return { ok: false, reason: "Too many requests from this network" };
  return { ok: true };
}

// ── Token issuance ───────────────────────────────────────────────────────────

export interface IssuedToken {
  /** The plaintext token to embed in the email link. Never persisted. */
  plaintext: string;
  /** The DB row id of the issued token. */
  tokenId: string;
  expiresAt: Date;
}

/**
 * Issue a sign-in token for the given user account. Caller is responsible for
 * having already resolved (or refused to resolve) the UserAccount — this
 * function does not look it up by email, to keep enumeration-resistance
 * decisions in the route handler.
 *
 * Returns null if `userAccountId` is null (no account exists for the email).
 * The route handler should respond with the same generic success in either case.
 */
export async function issueSignInToken(
  email: string,
  userAccountId: string | null,
  ip: string | null,
): Promise<IssuedToken | null> {
  // Invalidate any prior unused sign-in tokens for this email.
  await db.magicLinkToken.deleteMany({
    where: { email, purpose: "sign_in", usedAt: null },
  });

  if (!userAccountId) return null;

  const plaintext = generatePlaintextToken();
  const tokenHash = hashToken(plaintext);
  const expiresAt = new Date(Date.now() + SIGN_IN_TTL_MS);
  const row = await db.magicLinkToken.create({
    data: {
      tokenHash,
      purpose: "sign_in",
      userAccountId,
      email,
      expiresAt,
      createdFromIp: ip,
    },
  });
  return { plaintext, tokenId: row.id, expiresAt };
}

/**
 * Issue an invitation token bound to a specific Invitation row.
 * Plaintext is returned for embedding in the invitation email link.
 */
export async function issueInvitationToken(
  invitationId: string,
  email: string,
  ip: string | null,
): Promise<IssuedToken> {
  const plaintext = generatePlaintextToken();
  const tokenHash = hashToken(plaintext);
  const expiresAt = new Date(Date.now() + INVITATION_TTL_MS);
  const row = await db.magicLinkToken.create({
    data: {
      tokenHash,
      purpose: "invitation",
      email,
      invitationId,
      expiresAt,
      createdFromIp: ip,
    },
  });
  return { plaintext, tokenId: row.id, expiresAt };
}

// ── Verification ─────────────────────────────────────────────────────────────

export type VerifyResult =
  | { ok: true; tokenId: string; purpose: "sign_in"; userAccountId: string; email: string }
  | { ok: true; tokenId: string; purpose: "invitation"; invitationId: string; email: string }
  | { ok: false; reason: "invalid" | "expired" | "used" };

/**
 * Verify a plaintext token and atomically mark it used. Returns details of
 * the consumed token on success. Repeat calls with the same plaintext fail
 * with `used` after the first.
 */
export async function consumeToken(plaintext: string): Promise<VerifyResult> {
  if (!plaintext) return { ok: false, reason: "invalid" };

  const tokenHash = hashToken(plaintext);
  const token = await db.magicLinkToken.findUnique({ where: { tokenHash } });
  if (!token) return { ok: false, reason: "invalid" };
  if (token.usedAt) return { ok: false, reason: "used" };
  if (token.expiresAt.getTime() <= Date.now()) return { ok: false, reason: "expired" };

  // Mark used atomically. If concurrent verifies race, one will succeed.
  const updated = await db.magicLinkToken.updateMany({
    where: { id: token.id, usedAt: null },
    data: { usedAt: new Date() },
  });
  if (updated.count !== 1) return { ok: false, reason: "used" };

  if (token.purpose === "sign_in") {
    if (!token.userAccountId) return { ok: false, reason: "invalid" };
    return {
      ok: true,
      tokenId: token.id,
      purpose: "sign_in",
      userAccountId: token.userAccountId,
      email: token.email,
    };
  }
  if (token.purpose === "invitation") {
    if (!token.invitationId) return { ok: false, reason: "invalid" };
    return {
      ok: true,
      tokenId: token.id,
      purpose: "invitation",
      invitationId: token.invitationId,
      email: token.email,
    };
  }
  return { ok: false, reason: "invalid" };
}

/**
 * Look up an invitation token by plaintext WITHOUT consuming it.
 * Used by the invitation acceptance page to render details before the
 * recipient submits any missing fields. The accept route consumes the token.
 */
export async function peekInvitationToken(plaintext: string): Promise<
  | { ok: true; invitationId: string; email: string; expiresAt: Date }
  | { ok: false; reason: "invalid" | "expired" | "used" }
> {
  if (!plaintext) return { ok: false, reason: "invalid" };
  const tokenHash = hashToken(plaintext);
  const token = await db.magicLinkToken.findUnique({ where: { tokenHash } });
  if (!token || token.purpose !== "invitation" || !token.invitationId) {
    return { ok: false, reason: "invalid" };
  }
  if (token.usedAt) return { ok: false, reason: "used" };
  if (token.expiresAt.getTime() <= Date.now()) return { ok: false, reason: "expired" };
  return {
    ok: true,
    invitationId: token.invitationId,
    email: token.email,
    expiresAt: token.expiresAt,
  };
}
