/**
 * Platform-wide audit feed. Super Admin only.
 *
 * Same row shape as `GET /api/leagues/{id}/audit` but unfiltered by league.
 * Supports additional optional filters (`leagueId`, `actorUserAccountId`,
 * `action`) so the operator can slice the feed. Newest-first, paginated.
 *
 * Contract: specs/002-multi-league-platform/contracts/platform-contracts.md
 */

import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/authz/platform-scope";
import { ok, failFromError } from "@/lib/http/response";
import { parseQuery, z, paginationSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const querySchema = paginationSchema.extend({
  since: z.string().datetime().optional(),
  actorUserAccountId: z.string().min(1).optional(),
  leagueId: z.string().min(1).optional(),
  action: z.string().min(1).max(80).optional(),
});

interface AuditRow {
  id: string;
  action: string;
  actor: { kind: "user" | "migration" | "system"; userAccountId?: string; email?: string };
  leagueId: string | null;
  leagueName: string | null;
  leagueSlug: string | null;
  targetKind: string;
  targetId: string | null;
  details: Record<string, unknown>;
  createdAt: string;
}

export async function GET(req: NextRequest) {
  try {
    await requireSuperAdmin(req);
    const query = parseQuery(req, querySchema);

    const where: Record<string, unknown> = {};
    if (query.since) where.createdAt = { gte: new Date(query.since) };
    if (query.actorUserAccountId) where.actorUserAccountId = query.actorUserAccountId;
    if (query.leagueId) where.leagueId = query.leagueId;
    if (query.action) where.action = query.action;

    const [total, events] = await Promise.all([
      db.auditEvent.count({ where }),
      db.auditEvent.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        include: {
          actorUserAccount: { select: { email: true } },
          league: { select: { name: true, slug: true } },
        },
      }),
    ]);

    const rows: AuditRow[] = events.map((e) => {
      let details: Record<string, unknown> = {};
      if (e.details) {
        try {
          const parsed = JSON.parse(e.details);
          if (parsed && typeof parsed === "object") {
            details = parsed as Record<string, unknown>;
          }
        } catch {
          details = { _raw: e.details };
        }
      }
      const kind = (
        e.actorKind === "migration" || e.actorKind === "system" ? e.actorKind : "user"
      ) as "user" | "migration" | "system";
      const actor: AuditRow["actor"] = { kind };
      if (e.actorUserAccountId) actor.userAccountId = e.actorUserAccountId;
      if (e.actorUserAccount?.email) actor.email = e.actorUserAccount.email;

      return {
        id: e.id,
        action: e.action,
        actor,
        leagueId: e.leagueId,
        leagueName: e.league?.name ?? null,
        leagueSlug: e.league?.slug ?? null,
        targetKind: e.targetKind,
        targetId: e.targetId,
        details,
        createdAt: e.createdAt.toISOString(),
      };
    });

    return ok(rows, { meta: { total, page: query.page, limit: query.limit } });
  } catch (err) {
    return failFromError(err);
  }
}
