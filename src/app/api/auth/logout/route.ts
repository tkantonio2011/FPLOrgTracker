/**
 * Sign out — revokes the new session if present and clears both the new and
 * the legacy auth cookies.
 */

import { NextResponse, type NextRequest } from "next/server";
import { USER_COOKIE_NAME } from "@/lib/auth";
import {
  SESSION_COOKIE_NAME,
  clearSessionCookie,
  getSessionFromRequest,
  revokeSession,
} from "@/lib/auth/session";
import { logAuditEvent } from "@/lib/audit/log";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const res = NextResponse.json({ ok: true });

  // Revoke + clear new session.
  const session = await getSessionFromRequest(req);
  if (session) {
    await revokeSession(session.sessionId);
    void logAuditEvent({
      actorUserAccountId: session.userAccountId,
      action: "session.revoked",
      targetKind: "session",
      targetId: session.sessionId,
      details: { source: "user-initiated-logout" },
    });
  }
  clearSessionCookie(res);

  // Clear legacy cookie too — the user might be carrying both during transition.
  res.cookies.set(USER_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });
  // Also clear under the explicit new cookie name in case it differs from the
  // helper's default.
  res.cookies.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });

  return res;
}
