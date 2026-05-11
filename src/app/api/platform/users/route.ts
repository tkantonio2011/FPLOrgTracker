/**
 * Platform-level user accounts list. Super Admin only.
 *
 * Supports email substring search and a disabled-only filter. Each row
 * includes an `isSuperAdmin` flag (true iff an unrevoked SuperAdmin row
 * exists) and a `membershipCount` for the per-row "leagues" column on the
 * users page (T073).
 *
 * Contract: specs/002-multi-league-platform/contracts/platform-contracts.md
 */

import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/authz/platform-scope";
import { ok, failFromError } from "@/lib/http/response";
import { parseQuery, z } from "@/lib/validation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  search: z.string().trim().min(1).max(120).optional(),
  // Accept "1"/"true" as truthy; anything else is false (the default).
  disabledOnly: z
    .union([z.literal("1"), z.literal("true"), z.literal("0"), z.literal("false"), z.literal("")])
    .optional()
    .transform((v) => v === "1" || v === "true"),
});

interface UserRow {
  id: string;
  email: string;
  displayName: string | null;
  createdAt: string;
  lastLoginAt: string | null;
  disabledAt: string | null;
  isSuperAdmin: boolean;
  membershipCount: number;
}

export async function GET(req: NextRequest) {
  try {
    await requireSuperAdmin(req);
    const q = parseQuery(req, listQuerySchema);

    const where: Record<string, unknown> = {};
    if (q.search) where.email = { contains: q.search };
    if (q.disabledOnly) where.disabledAt = { not: null };

    const [total, accounts] = await Promise.all([
      db.userAccount.count({ where }),
      db.userAccount.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (q.page - 1) * q.limit,
        take: q.limit,
        include: {
          superAdmin: { select: { revokedAt: true } },
        },
      }),
    ]);

    const accountIds = accounts.map((a) => a.id);
    const membershipCounts = await db.leagueMembership.groupBy({
      by: ["userAccountId"],
      where: { userAccountId: { in: accountIds }, isActive: true },
      _count: { _all: true },
    });
    const membershipCountBy = new Map(
      membershipCounts
        .filter((r): r is { userAccountId: string; _count: { _all: number } } => r.userAccountId !== null)
        .map((r) => [r.userAccountId, r._count._all]),
    );

    const rows: UserRow[] = accounts.map((a) => ({
      id: a.id,
      email: a.email,
      displayName: a.displayName,
      createdAt: a.createdAt.toISOString(),
      lastLoginAt: a.lastLoginAt?.toISOString() ?? null,
      disabledAt: a.disabledAt?.toISOString() ?? null,
      isSuperAdmin: !!a.superAdmin && !a.superAdmin.revokedAt,
      membershipCount: membershipCountBy.get(a.id) ?? 0,
    }));

    return ok(rows, { meta: { total, page: q.page, limit: q.limit } });
  } catch (err) {
    return failFromError(err);
  }
}
