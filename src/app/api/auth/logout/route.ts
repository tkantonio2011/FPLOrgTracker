/**
 * Sign out — revokes the current session and clears the cookie.
 */

import { NextResponse, type NextRequest } from "next/server";
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

  // Also clear under the explicit cookie name in case it differs from the
  // helper's default (e.g. via SESSION_COOKIE_NAME env override).
  res.cookies.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });

  return res;
}
