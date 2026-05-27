/**
 * Platform single-league endpoint.
 *
 * GET    — Super Admin view of a league: settings, members (full list),
 *          last-50 audit entries. Shape is a superset of GET /api/leagues/{id}.
 * DELETE — hard-delete a league. Requires `?confirm=<slug>` to match the
 *          target league's slug — guards against accidental deletion. Cascade
 *          removes LeagueMembership, Invitation, LeagueSlugHistory rows. The
 *          AuditEvent rows are retained (leagueId becomes null via the
 *          `onDelete: SetNull` FK rule); a final `league.deleted` audit row is
 *          written after the delete with the deleted league's name/slug in
 *          details for historical reference.
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

interface PlatformLeagueDetail {
  id: string;
  slug: string;
  name: string;
  logoUrl: string | null;
  miniLeagueId: number | null;
  status: "active" | "suspended";
  memberCount: number;
  adminCount: number;
  createdAt: string;
  suspendedAt: string | null;
  suspensionReason: string | null;
  digestPrompt: string | null;
  members: Array<{
    id: string;
    managerId: number;
    displayName: string | null;
    teamName: string | null;
    role: "member" | "admin";
    source: "league" | "manual" | "invitation";
    isActive: boolean;
    email: string | null;
    hasUserAccount: boolean;
    addedAt: string;
  }>;
  recentAudit: Array<{
    id: string;
    action: string;
    actor: { kind: "user" | "migration" | "system"; userAccountId?: string; email?: string };
    targetKind: string;
    targetId: string | null;
    details: Record<string, unknown>;
    createdAt: string;
  }>;
}

export async function GET(req: NextRequest, ctx: { params: { leagueId: string } }) {
  try {
    await requireSuperAdmin(req);

    const league = await db.league.findUnique({ where: { id: ctx.params.leagueId } });
    if (!league) return fail("League not found", 404);

    const [memberships, recentEvents] = await Promise.all([
      db.leagueMembership.findMany({
        where: { leagueId: league.id },
        orderBy: [{ isActive: "desc" }, { role: "desc" }, { displayName: "asc" }],
        include: { userAccount: { select: { email: true } } },
      }),
      db.auditEvent.findMany({
        where: { leagueId: league.id },
        orderBy: { createdAt: "desc" },
        take: 50,
        include: { actorUserAccount: { select: { email: true } } },
      }),
    ]);

    const members: PlatformLeagueDetail["members"] = memberships.map((m) => ({
      id: m.id,
      managerId: m.managerId,
      displayName: m.displayName,
      teamName: m.teamName,
      role: m.role === "admin" ? "admin" : "member",
      source: (m.source === "league" || m.source === "invitation" ? m.source : "manual") as
        | "league"
        | "manual"
        | "invitation",
      isActive: m.isActive,
      email: m.userAccount?.email ?? null,
      hasUserAccount: m.userAccountId !== null,
      addedAt: m.addedAt.toISOString(),
    }));

    const memberCount = members.filter((m) => m.isActive).length;
    const adminCount = members.filter((m) => m.isActive && m.role === "admin").length;

    const recentAudit: PlatformLeagueDetail["recentAudit"] = recentEvents.map((e) => {
      let details: Record<string, unknown> = {};
      if (e.details) {
        try {
          const parsed = JSON.parse(e.details);
          details = typeof parsed === "object" && parsed !== null ? parsed : { _raw: parsed };
        } catch {
          details = { _raw: e.details };
        }
      }
      const actorKind = (
        e.actorKind === "migration" || e.actorKind === "system" ? e.actorKind : "user"
      ) as "user" | "migration" | "system";
      return {
        id: e.id,
        action: e.action,
        actor: {
          kind: actorKind,
          userAccountId: e.actorUserAccountId ?? undefined,
          email: e.actorUserAccount?.email ?? undefined,
        },
        targetKind: e.targetKind,
        targetId: e.targetId,
        details,
        createdAt: e.createdAt.toISOString(),
      };
    });

    const detail: PlatformLeagueDetail = {
      id: league.id,
      slug: league.slug,
      name: league.name,
      logoUrl: league.logoUrl,
      miniLeagueId: league.miniLeagueId,
      status: league.status === "suspended" ? "suspended" : "active",
      memberCount,
      adminCount,
      createdAt: league.createdAt.toISOString(),
      suspendedAt: league.suspendedAt?.toISOString() ?? null,
      suspensionReason: league.suspensionReason,
      digestPrompt: league.digestPrompt,
      members,
      recentAudit,
    };

    return ok(detail);
  } catch (err) {
    return failFromError(err);
  }
}

export async function DELETE(req: NextRequest, ctx: { params: { leagueId: string } }) {
  try {
    const { user } = await requireSuperAdmin(req);

    const league = await db.league.findUnique({ where: { id: ctx.params.leagueId } });
    if (!league) return fail("League not found", 404);

    const confirm = req.nextUrl.searchParams.get("confirm");
    if (confirm !== league.slug) {
      return fail(
        "Confirmation slug does not match — pass ?confirm=<slug> with the league's current slug to delete",
        400,
      );
    }

    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;

    // Cascade deletion via FK rules:
    //   LeagueMembership / Invitation / LeagueSlugHistory → onDelete: Cascade
    //   AuditEvent.leagueId → onDelete: SetNull (history preserved, just unlinked)
    // Sessions are NOT tied to leagues; user accounts persist independently.
    await db.league.delete({ where: { id: league.id } });

    // Audit row is written AFTER the deletion. Its leagueId is null because
    // the League row no longer exists; the deleted league's identity is
    // preserved in `targetId` + `details`.
    await logAuditEvent({
      leagueId: null,
      actorUserAccountId: user.userAccount.id,
      action: "league.deleted",
      targetKind: "league",
      targetId: league.id,
      details: { name: league.name, slug: league.slug },
      requestIp: ip,
    });

    return ok({ deleted: true });
  } catch (err) {
    return failFromError(err);
  }
}
