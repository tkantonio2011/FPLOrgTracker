/**
 * League-scoped audit feed.
 *
 * GET — League Admin only (Super Admin bypasses). Returns a paginated list
 *       of `AuditEvent` rows scoped to this league, newest first.
 *
 * Contract: specs/002-multi-league-platform/contracts/league-contracts.md
 */

import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireLeagueAdmin } from "@/lib/authz/league-scope";
import { ok, failFromError } from "@/lib/http/response";
import { parseQuery, z, paginationSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const querySchema = paginationSchema.extend({
  since: z
    .string()
    .datetime()
    .optional(),
});

interface AuditRow {
  id: string;
  action: string;
  actor: { kind: "user" | "migration" | "system"; userAccountId?: string; email?: string };
  targetKind: string;
  targetId: string | null;
  details: Record<string, unknown>;
  createdAt: string;
}

export async function GET(req: NextRequest, ctx: { params: { leagueId: string } }) {
  try {
    const { league } = await requireLeagueAdmin(req, ctx.params.leagueId);
    const query = parseQuery(req, querySchema);

    const where = {
      leagueId: league.id,
      ...(query.since ? { createdAt: { gte: new Date(query.since) } } : {}),
    };

    const [total, events] = await Promise.all([
      db.auditEvent.count({ where }),
      db.auditEvent.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        include: { actorUserAccount: { select: { email: true } } },
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
          // Malformed payload — surface the raw string under `_raw` so the
          // admin UI can still display something useful.
          details = { _raw: e.details };
        }
      }
      const kind = (e.actorKind === "migration" || e.actorKind === "system" ? e.actorKind : "user") as
        | "user"
        | "migration"
        | "system";
      const actor: AuditRow["actor"] = { kind };
      if (e.actorUserAccountId) actor.userAccountId = e.actorUserAccountId;
      if (e.actorUserAccount?.email) actor.email = e.actorUserAccount.email;

      return {
        id: e.id,
        action: e.action,
        actor,
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
