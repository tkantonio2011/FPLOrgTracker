/**
 * Resolve a slug-or-id reference to a League, gated by the requester's
 * membership. Returns 404 to non-members (intentional non-disclosure — never
 * reveal a league's existence to a user who isn't in it).
 *
 * Super Admins bypass membership and suspension checks but still go through
 * this helper so the audit/log surface is uniform.
 */

import { db } from "@/lib/db";
import {
  LeagueNotVisibleError,
  LeagueSuspendedError,
} from "@/lib/authz/errors";

export interface ResolvedLeague {
  league: {
    id: string;
    slug: string;
    name: string;
    logoUrl: string | null;
    status: "active" | "suspended";
    miniLeagueId: number | null;
  };
  /** null when the resolver was called for a Super Admin who is not a member. */
  membership: {
    id: string;
    role: "member" | "admin";
    isActive: boolean;
    managerId: number;
  } | null;
}

/**
 * Resolve the league referenced by `slugOrId`, validating that the requester
 * is allowed to see it. The caller decides whether membership is required by
 * passing `requireMembership: true`; Super Admin reads typically pass false.
 */
export async function resolveLeague(
  slugOrId: string,
  userAccountId: string | null,
  options: { isSuperAdmin: boolean; requireMembership: boolean },
): Promise<ResolvedLeague> {
  // Look up by slug (current → history) then by id.
  let league = await db.league.findUnique({ where: { slug: slugOrId } });

  if (!league) {
    const historic = await db.leagueSlugHistory.findUnique({ where: { slug: slugOrId } });
    if (historic) {
      league = await db.league.findUnique({ where: { id: historic.leagueId } });
    }
  }

  if (!league) {
    league = await db.league.findUnique({ where: { id: slugOrId } });
  }

  if (!league) throw new LeagueNotVisibleError();

  const membership = userAccountId
    ? await db.leagueMembership.findUnique({
        where: { leagueId_userAccountId: { leagueId: league.id, userAccountId } },
      })
    : null;

  // Membership check (skipped for Super Admins).
  if (options.requireMembership && !options.isSuperAdmin) {
    if (!membership || !membership.isActive) {
      // Pretend the league does not exist to avoid leaking its existence.
      throw new LeagueNotVisibleError();
    }
  }

  // Suspension check: members and league admins are blocked. Super Admins pass.
  if (league.status === "suspended" && !options.isSuperAdmin) {
    throw new LeagueSuspendedError();
  }

  return {
    league: {
      id: league.id,
      slug: league.slug,
      name: league.name,
      logoUrl: league.logoUrl,
      status: league.status === "suspended" ? "suspended" : "active",
      miniLeagueId: league.miniLeagueId,
    },
    membership: membership
      ? {
          id: membership.id,
          role: membership.role === "admin" ? "admin" : "member",
          isActive: membership.isActive,
          managerId: membership.managerId,
        }
      : null,
  };
}
