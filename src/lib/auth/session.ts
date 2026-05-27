/**
 * Server-side session management.
 *
 * Cookie carries a random opaque token. Validity is determined by hashed
 * lookup of a Session row, allowing server-side revocation (logout, admin
 * disable, league deletion). Sliding 30-day TTL — `lastSeenAt` is bumped on
 * every authenticated request more than 1 hour after the previous bump.
 */

import { createHash, randomBytes } from "crypto";
import type { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const SESSION_COOKIE_NAME = process.env.SESSION_COOKIE_NAME ?? "session";
const TTL_DAYS = parseInt(process.env.SESSION_TTL_DAYS ?? "30", 10);
export const SESSION_TTL_MS = TTL_DAYS * 24 * 60 * 60 * 1000;
const SLIDE_THRESHOLD_MS = 60 * 60 * 1000; // 1 hour

/**
 * Whether the session cookie should carry the `Secure` attribute. Set by the
 * operator via the COOKIE_SECURE env var (true ⇒ HTTPS-only). Defaults to
 * false because the existing UAT / production deployments are HTTP-only; a
 * Secure cookie over HTTP is silently dropped by the browser, so the operator
 * must opt-in only when the site is actually served over TLS.
 *
 * Reading NODE_ENV is the wrong control here: a Next.js standalone build runs
 * with NODE_ENV=production regardless of whether the actual deployment uses
 * HTTPS, and that mismatch breaks magic-link sign-in on HTTP hosts.
 */
const COOKIE_SECURE = process.env.COOKIE_SECURE === "true";

function hashToken(plaintext: string): string {
  return createHash("sha256").update(plaintext).digest("hex");
}

function generatePlaintextToken(): string {
  return randomBytes(32).toString("base64url");
}

export interface CreatedSession {
  sessionId: string;
  plaintextToken: string;
  expiresAt: Date;
}

/** Create a new Session row and return the plaintext cookie value. */
export async function createSession(
  userAccountId: string,
  meta: { userAgent?: string | null; ip?: string | null } = {},
): Promise<CreatedSession> {
  const plaintext = generatePlaintextToken();
  const tokenHash = hashToken(plaintext);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  const row = await db.session.create({
    data: {
      tokenHash,
      userAccountId,
      expiresAt,
      userAgent: meta.userAgent ?? null,
      ip: meta.ip ?? null,
    },
  });
  return { sessionId: row.id, plaintextToken: plaintext, expiresAt };
}

/** Set the session cookie on a NextResponse. */
export function setSessionCookie(res: NextResponse, plaintextToken: string, expiresAt: Date): void {
  res.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: plaintextToken,
    httpOnly: true,
    secure: COOKIE_SECURE,
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

/** Clear the session cookie. */
export function clearSessionCookie(res: NextResponse): void {
  res.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: "",
    httpOnly: true,
    secure: COOKIE_SECURE,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

export interface ResolvedSession {
  sessionId: string;
  userAccountId: string;
}

/**
 * Resolve the current session from a request's cookie jar.
 * Returns null if the cookie is missing, the session is not found, expired,
 * or revoked. Also performs the sliding refresh.
 */
export async function getSessionFromRequest(req: NextRequest): Promise<ResolvedSession | null> {
  const cookie = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  return resolveByToken(cookie);
}

/**
 * Resolve session from raw cookie value (for use in Server Components where
 * we already have `cookies().get(SESSION_COOKIE_NAME)?.value`).
 */
export async function getSessionFromToken(token: string | undefined): Promise<ResolvedSession | null> {
  return resolveByToken(token);
}

async function resolveByToken(token: string | undefined): Promise<ResolvedSession | null> {
  if (!token) return null;
  const tokenHash = hashToken(token);
  const session = await db.session.findUnique({ where: { tokenHash } });
  if (!session) return null;
  if (session.revokedAt) return null;
  if (session.expiresAt.getTime() <= Date.now()) return null;

  // Sliding refresh — only writes when the cost is worth it.
  const lastSeenMs = session.lastSeenAt.getTime();
  if (Date.now() - lastSeenMs > SLIDE_THRESHOLD_MS) {
    const newExpires = new Date(Date.now() + SESSION_TTL_MS);
    await db.session.update({
      where: { id: session.id },
      data: { lastSeenAt: new Date(), expiresAt: newExpires },
    });
  }

  return { sessionId: session.id, userAccountId: session.userAccountId };
}

/** Revoke a single session by id. Idempotent. */
export async function revokeSession(sessionId: string): Promise<void> {
  await db.session.updateMany({
    where: { id: sessionId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/** Revoke every active session for a user — used by Super Admin disable. */
export async function revokeAllSessionsForUser(userAccountId: string): Promise<number> {
  const result = await db.session.updateMany({
    where: { userAccountId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  return result.count;
}
