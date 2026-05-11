/**
 * Reinstate a previously suspended league. Symmetric counterpart to /suspend.
 * Clears the suspension fields and flips status back to 'active'.
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

export async function POST(req: NextRequest, ctx: { params: { leagueId: string } }) {
  try {
    const { user } = await requireSuperAdmin(req);

    const league = await db.league.findUnique({ where: { id: ctx.params.leagueId } });
    if (!league) return fail("League not found", 404);
    if (league.status !== "suspended") return fail("League is not suspended", 409);

    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
    const priorReason = league.suspensionReason;
    const priorSuspendedAt = league.suspendedAt;

    const updated = await db.league.update({
      where: { id: league.id },
      data: {
        status: "active",
        suspendedAt: null,
        suspendedByUserAccountId: null,
        suspensionReason: null,
      },
    });

    await logAuditEvent({
      leagueId: league.id,
      actorUserAccountId: user.userAccount.id,
      action: "league.reinstated",
      targetKind: "league",
      targetId: league.id,
      details: {
        priorSuspendedAt: priorSuspendedAt?.toISOString() ?? null,
        priorReason,
      },
      requestIp: ip,
    });

    return ok({
      id: updated.id,
      slug: updated.slug,
      name: updated.name,
      status: "active" as const,
      suspendedAt: null,
      suspensionReason: null,
    });
  } catch (err) {
    return failFromError(err);
  }
}
