/**
 * Read-side queries against the AuditEvent log. Writes go through
 * `@/lib/audit/log#logAuditEvent`.
 */

import { db } from "@/lib/db";

export interface AuditQueryOptions {
  page: number;
  limit: number;
  since?: Date;
  leagueId?: string | null;
  actorUserAccountId?: string;
  action?: string;
}

export async function queryAuditEvents(opts: AuditQueryOptions) {
  const where = {
    ...(opts.leagueId !== undefined ? { leagueId: opts.leagueId } : {}),
    ...(opts.actorUserAccountId ? { actorUserAccountId: opts.actorUserAccountId } : {}),
    ...(opts.action ? { action: opts.action } : {}),
    ...(opts.since ? { createdAt: { gte: opts.since } } : {}),
  };
  const [items, total] = await Promise.all([
    db.auditEvent.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (opts.page - 1) * opts.limit,
      take: opts.limit,
      include: {
        actorUserAccount: { select: { email: true, displayName: true } },
      },
    }),
    db.auditEvent.count({ where }),
  ]);

  // Decode JSON-encoded `details` for easy consumption upstream.
  const decoded = items.map((row) => ({
    ...row,
    details: row.details ? safeParseJson(row.details) : null,
  }));

  return { items: decoded, total };
}

export async function lastActivityForLeague(leagueId: string): Promise<Date | null> {
  const row = await db.auditEvent.findFirst({
    where: { leagueId },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  return row?.createdAt ?? null;
}

function safeParseJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}
