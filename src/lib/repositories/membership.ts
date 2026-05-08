/**
 * League membership repository. Every function takes `leagueId` explicitly
 * (or operates on a single membership id where league scope is implicit).
 */

import { db } from "@/lib/db";

export async function findMembership(leagueId: string, userAccountId: string) {
  return db.leagueMembership.findUnique({
    where: { leagueId_userAccountId: { leagueId, userAccountId } },
  });
}

export async function findMembershipById(membershipId: string) {
  return db.leagueMembership.findUnique({ where: { id: membershipId } });
}

export async function listMemberships(opts: {
  leagueId: string;
  includeInactive: boolean;
  page: number;
  limit: number;
}) {
  const where = {
    leagueId: opts.leagueId,
    ...(opts.includeInactive ? {} : { isActive: true }),
  };
  const [items, total] = await Promise.all([
    db.leagueMembership.findMany({
      where,
      orderBy: { addedAt: "asc" },
      skip: (opts.page - 1) * opts.limit,
      take: opts.limit,
      include: {
        userAccount: { select: { email: true, displayName: true } },
      },
    }),
    db.leagueMembership.count({ where }),
  ]);
  return { items, total };
}

export interface MembershipCreateInput {
  leagueId: string;
  userAccountId: string | null;
  managerId: number;
  displayName?: string | null;
  teamName?: string | null;
  role?: "member" | "admin";
  source: "league" | "manual" | "invitation";
  addedByUserAccountId?: string | null;
}

export async function createMembership(input: MembershipCreateInput) {
  return db.leagueMembership.create({
    data: {
      leagueId: input.leagueId,
      userAccountId: input.userAccountId,
      managerId: input.managerId,
      displayName: input.displayName ?? null,
      teamName: input.teamName ?? null,
      role: input.role ?? "member",
      source: input.source,
      addedByUserAccountId: input.addedByUserAccountId ?? null,
    },
  });
}

export interface MembershipUpdateInput {
  displayName?: string | null;
  teamName?: string | null;
  isActive?: boolean;
  pointsDeductionPerGw?: number;
  role?: "member" | "admin";
  userAccountId?: string | null;
}

export async function updateMembership(membershipId: string, input: MembershipUpdateInput) {
  return db.leagueMembership.update({ where: { id: membershipId }, data: input });
}

export async function deleteMembership(membershipId: string) {
  return db.leagueMembership.delete({ where: { id: membershipId } });
}

export async function findMembershipByManagerId(leagueId: string, managerId: number) {
  return db.leagueMembership.findUnique({
    where: { leagueId_managerId: { leagueId, managerId } },
  });
}

export async function listManagerIdsForLeague(leagueId: string): Promise<number[]> {
  const rows = await db.leagueMembership.findMany({
    where: { leagueId, isActive: true },
    select: { managerId: true },
  });
  return rows.map((r) => r.managerId);
}
