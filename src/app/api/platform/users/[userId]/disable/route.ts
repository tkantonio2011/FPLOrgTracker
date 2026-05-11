/**
 * Disable a user account.
 *
 * Sets `disabledAt = now` and revokes every active Session for the user so
 * they are signed out of all devices immediately. Disabled accounts are
 * rejected by `getServerUser` (returns null), so subsequent requests with
 * a stale cookie also fail open to "not signed in".
 *
 * Contract: specs/002-multi-league-platform/contracts/platform-contracts.md
 */

import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/authz/platform-scope";
import { ok, fail, failFromError } from "@/lib/http/response";
import { logAuditEvent } from "@/lib/audit/log";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest, ctx: { params: { userId: string } }) {
  try {
    const { user } = await requireSuperAdmin(req);

    const target = await db.userAccount.findUnique({ where: { id: ctx.params.userId } });
    if (!target) return fail("User not found", 404);

    if (target.disabledAt) {
      return ok({ disabled: true, alreadyDisabled: true });
    }

    // Safety: refuse self-disable when the requester is the last active Super
    // Admin. Bootstrap recovery via env var creates the SuperAdmin row but does
    // not clear `disabledAt`, so locking yourself out without another SA is
    // genuinely a hard recovery (requires direct DB access). Not in the
    // contract but the alternative is a permanent foot-gun.
    if (target.id === user.userAccount.id) {
      const otherActiveSupers = await db.superAdmin.count({
        where: { userAccountId: { not: target.id }, revokedAt: null },
      });
      if (otherActiveSupers === 0) {
        return fail(
          "Cannot disable your own account — you are the only active Super Admin. Grant Super Admin to another user first.",
          409,
        );
      }
    }

    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
    const now = new Date();

    await db.$transaction([
      db.userAccount.update({ where: { id: target.id }, data: { disabledAt: now } }),
      db.session.updateMany({
        where: { userAccountId: target.id, revokedAt: null },
        data: { revokedAt: now },
      }),
    ]);

    await logAuditEvent({
      leagueId: null,
      actorUserAccountId: user.userAccount.id,
      action: "user_account.disabled",
      targetKind: "user_account",
      targetId: target.id,
      details: { targetEmail: target.email },
      requestIp: ip,
    });

    return ok({ disabled: true });
  } catch (err) {
    return failFromError(err);
  }
}
