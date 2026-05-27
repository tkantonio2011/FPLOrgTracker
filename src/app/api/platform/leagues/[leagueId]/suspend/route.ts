/**
 * Suspend a league. Members lose access (requireLeagueMember denies);
 * Super Admins continue to see it. League Admins of the suspended league
 * are blocked from admin endpoints too — the only way back is reinstate.
 *
 * Contract: specs/002-multi-league-platform/contracts/platform-contracts.md
 */

import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/authz/platform-scope";
import { ok, fail, failFromError } from "@/lib/http/response";
import { logAuditEvent } from "@/lib/audit/log";
import { parseBody, z } from "@/lib/validation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const bodySchema = z.object({
  reason: z.string().trim().max(500).optional(),
});

export async function POST(req: NextRequest, ctx: { params: { leagueId: string } }) {
  try {
    const { user } = await requireSuperAdmin(req);
    // Body is optional — accept an empty body too.
    const raw = await req.text();
    const body = bodySchema.parse(raw ? JSON.parse(raw) : {});

    const league = await db.league.findUnique({ where: { id: ctx.params.leagueId } });
    if (!league) return fail("League not found", 404);
    if (league.status === "suspended") return fail("League is already suspended", 409);

    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
    const now = new Date();

    const updated = await db.league.update({
      where: { id: league.id },
      data: {
        status: "suspended",
        suspendedAt: now,
        suspendedByUserAccountId: user.userAccount.id,
        suspensionReason: body.reason ?? null,
      },
    });

    await logAuditEvent({
      leagueId: league.id,
      actorUserAccountId: user.userAccount.id,
      action: "league.suspended",
      targetKind: "league",
      targetId: league.id,
      details: { reason: body.reason ?? null },
      requestIp: ip,
    });

    return ok({
      id: updated.id,
      slug: updated.slug,
      name: updated.name,
      status: "suspended" as const,
      suspendedAt: updated.suspendedAt?.toISOString() ?? null,
      suspensionReason: updated.suspensionReason,
    });
  } catch (err) {
    return failFromError(err);
  }
}
