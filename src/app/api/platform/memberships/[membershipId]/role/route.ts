/**
 * Platform-scoped membership role change. Super Admin promotes/demotes a
 * member of any league. Enforces the same last-admin guard as the
 * league-scoped PATCH (T060): demotion of the only active admin returns 409.
 *
 * Contract: specs/002-multi-league-platform/contracts/platform-contracts.md
 */

import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/authz/platform-scope";
import { ok, fail, failFromError } from "@/lib/http/response";
import { logAuditEvent } from "@/lib/audit/log";
import { parseBody, z, roleSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const patchSchema = z.object({ role: roleSchema });

export async function PATCH(
  req: NextRequest,
  ctx: { params: { membershipId: string } },
) {
  try {
    const { user } = await requireSuperAdmin(req);
    const body = await parseBody(req, patchSchema);

    const membership = await db.leagueMembership.findUnique({
      where: { id: ctx.params.membershipId },
      include: { userAccount: { select: { email: true } } },
    });
    if (!membership) return fail("Membership not found", 404);

    if (body.role === membership.role) {
      // No-op — return current state without writing audit.
      return ok({
        id: membership.id,
        leagueId: membership.leagueId,
        role: membership.role === "admin" ? "admin" : "member",
        isActive: membership.isActive,
        unchanged: true,
      });
    }

    // Last-admin guard: demoting the only active admin → 409.
    if (membership.role === "admin" && body.role === "member" && membership.isActive) {
      const otherAdmins = await db.leagueMembership.count({
        where: {
          leagueId: membership.leagueId,
          role: "admin",
          isActive: true,
          NOT: { id: membership.id },
        },
      });
      if (otherAdmins === 0) {
        return fail("Cannot demote the only admin", 409);
      }
    }

    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;

    const updated = await db.leagueMembership.update({
      where: { id: membership.id },
      data: { role: body.role },
    });

    await logAuditEvent({
      leagueId: membership.leagueId,
      actorUserAccountId: user.userAccount.id,
      action: "membership.role_changed",
      targetKind: "membership",
      targetId: membership.id,
      details: { from: membership.role, to: body.role, platformActor: true },
      requestIp: ip,
    });

    return ok({
      id: updated.id,
      leagueId: updated.leagueId,
      role: updated.role === "admin" ? "admin" : "member",
      isActive: updated.isActive,
    });
  } catch (err) {
    return failFromError(err);
  }
}
