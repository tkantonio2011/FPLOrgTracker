/**
 * League repository. Every read takes a typed `leagueId` parameter — there
 * is no implicit "current league" lookup anywhere in the codebase.
 */

import { db } from "@/lib/db";

export async function findLeagueById(leagueId: string) {
  return db.league.findUnique({ where: { id: leagueId } });
}

export async function findLeagueBySlug(slug: string) {
  return db.league.findUnique({ where: { slug } });
}

export async function listAllLeagues(opts: { page: number; limit: number; status?: "active" | "suspended"; search?: string }) {
  const where = {
    ...(opts.status ? { status: opts.status } : {}),
    ...(opts.search
      ? {
          OR: [
            { name: { contains: opts.search } },
            { slug: { contains: opts.search } },
          ],
        }
      : {}),
  };
  const [items, total] = await Promise.all([
    db.league.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (opts.page - 1) * opts.limit,
      take: opts.limit,
    }),
    db.league.count({ where }),
  ]);
  return { items, total };
}

export interface LeagueCreateInput {
  name: string;
  slug: string;
  miniLeagueId?: number | null;
  logoUrl?: string | null;
  digestPrompt?: string | null;
  createdByUserAccountId?: string | null;
}

export async function createLeague(input: LeagueCreateInput) {
  return db.league.create({
    data: {
      name: input.name,
      slug: input.slug,
      miniLeagueId: input.miniLeagueId ?? null,
      logoUrl: input.logoUrl ?? null,
      digestPrompt: input.digestPrompt ?? null,
      createdByUserAccountId: input.createdByUserAccountId ?? null,
    },
  });
}

export interface LeagueUpdateInput {
  name?: string;
  slug?: string;
  logoUrl?: string | null;
  miniLeagueId?: number | null;
  digestPrompt?: string | null;
}

/**
 * Update a league. If the slug changes, write a LeagueSlugHistory row in
 * the same transaction so old URLs continue to redirect.
 */
export async function updateLeague(leagueId: string, input: LeagueUpdateInput) {
  return db.$transaction(async (tx) => {
    const current = await tx.league.findUnique({ where: { id: leagueId } });
    if (!current) throw new Error(`League not found: ${leagueId}`);
    if (input.slug && input.slug !== current.slug) {
      await tx.leagueSlugHistory.create({
        data: { leagueId: current.id, slug: current.slug },
      });
    }
    return tx.league.update({ where: { id: leagueId }, data: input });
  });
}

export async function suspendLeague(leagueId: string, by: string, reason: string | null) {
  return db.league.update({
    where: { id: leagueId },
    data: {
      status: "suspended",
      suspendedAt: new Date(),
      suspendedByUserAccountId: by,
      suspensionReason: reason,
    },
  });
}

export async function reinstateLeague(leagueId: string) {
  return db.league.update({
    where: { id: leagueId },
    data: {
      status: "active",
      suspendedAt: null,
      suspendedByUserAccountId: null,
      suspensionReason: null,
    },
  });
}

export async function deleteLeague(leagueId: string) {
  return db.league.delete({ where: { id: leagueId } });
}

export async function countActiveLeagueAdmins(leagueId: string): Promise<number> {
  return db.leagueMembership.count({
    where: { leagueId, role: "admin", isActive: true },
  });
}
