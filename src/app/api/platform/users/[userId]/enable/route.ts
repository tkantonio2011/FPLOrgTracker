/**
 * Re-enable a previously disabled user account.
 *
 * Clears `disabledAt`. Does NOT recreate sessions — the user must sign in
 * again. Symmetric counterpart to /disable.
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

    if (!target.disabledAt) {
      return ok({ disabled: false, alreadyEnabled: true });
    }

    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;

    await db.userAccount.update({
      where: { id: target.id },
      data: { disabledAt: null },
    });

    await logAuditEvent({
      leagueId: null,
      actorUserAccountId: user.userAccount.id,
      action: "user_account.enabled",
      targetKind: "user_account",
      targetId: target.id,
      details: { targetEmail: target.email },
      requestIp: ip,
    });

    return ok({ disabled: false });
  } catch (err) {
    return failFromError(err);
  }
}
