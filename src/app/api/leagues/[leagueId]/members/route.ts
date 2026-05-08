/**
 * League-scoped member list. Read available to any league member; future
 * write endpoints (POST add-by-manager-id) gate via requireLeagueAdmin in T059.
 */

import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireLeagueMember } from "@/lib/authz/league-scope";
import { ok, failFromError } from "@/lib/http/response";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest, ctx: { params: { leagueId: string } }) {
  try {
    const { league, user } = await requireLeagueMember(req, ctx.params.leagueId);
    const isAdmin =
      user.userAccount.isSuperAdmin ||
      (await db.leagueMembership.findFirst({
        where: { leagueId: league.id, userAccountId: user.userAccount.id, role: "admin", isActive: true },
        select: { id: true },
      })) !== null;

    const memberships = await db.leagueMembership.findMany({
      where: { leagueId: league.id, isActive: true },
      orderBy: { addedAt: "asc" },
      include: { userAccount: { select: { email: true } } },
    });

    // Shape mirrors the legacy `members` payload: every consumer reads
    // managerId / displayName / teamName from each row. Email is admin-only.
    const members = memberships.map((m) => ({
      id: m.id,
      managerId: m.managerId,
      displayName: m.displayName,
      teamName: m.teamName,
      isActive: m.isActive,
      pointsDeductionPerGw: m.pointsDeductionPerGw,
      role: m.role,
      source: m.source,
      addedAt: m.addedAt,
      ...(isAdmin ? { email: m.userAccount?.email ?? null } : {}),
    }));

    return ok({ members });
  } catch (err) {
    return failFromError(err);
  }
}
