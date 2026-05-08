/**
 * Session repository — read-only queries about a user's sessions.
 * Session creation/revocation lives in `@/lib/auth/session` because that
 * module also owns the cookie wire-format.
 */

import { db } from "@/lib/db";

export async function listSessionsForUser(userAccountId: string, opts: { activeOnly: boolean }) {
  return db.session.findMany({
    where: {
      userAccountId,
      ...(opts.activeOnly ? { revokedAt: null, expiresAt: { gt: new Date() } } : {}),
    },
    orderBy: { lastSeenAt: "desc" },
  });
}

export async function countActiveSessions(userAccountId: string): Promise<number> {
  return db.session.count({
    where: { userAccountId, revokedAt: null, expiresAt: { gt: new Date() } },
  });
}
