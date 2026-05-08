/**
 * Authorisation helpers for league-scoped endpoints. Every handler under
 * `/api/leagues/[leagueId]/...` MUST start with one of these.
 *
 * Usage in a route handler:
 *   const { userAccount, league, membership } = await requireLeagueMember(req, ctx.params.leagueId);
 *
 * Failures throw an AuthzError; route handlers convert to envelope via
 * `failFromError(err)` from `@/lib/http/response`.
 */

import type { NextRequest } from "next/server";
import { getServerUser, getServerUserFromCookie, type CurrentUser } from "@/lib/auth/current-user";
import { resolveLeague, type ResolvedLeague } from "@/lib/authz/league-resolver";
import {
  NotAuthorisedError,
  NotSignedInError,
} from "@/lib/authz/errors";

/** Require a signed-in user with no league-scope check. */
export async function requireSession(req: NextRequest): Promise<{ user: CurrentUser }> {
  const user = await getServerUser(req);
  if (!user) throw new NotSignedInError();
  return { user };
}

/** Variant for Server Components that already have the cookie value. */
export async function requireSessionFromCookie(token: string | undefined): Promise<{ user: CurrentUser }> {
  const user = await getServerUserFromCookie(token);
  if (!user) throw new NotSignedInError();
  return { user };
}

export interface LeagueScopeResult {
  user: CurrentUser;
  league: ResolvedLeague["league"];
  membership: ResolvedLeague["membership"];
}

/** Require a signed-in user who is a member of the referenced league. */
export async function requireLeagueMember(
  req: NextRequest,
  slugOrId: string,
): Promise<LeagueScopeResult> {
  const { user } = await requireSession(req);
  const resolved = await resolveLeague(slugOrId, user.userAccount.id, {
    isSuperAdmin: user.userAccount.isSuperAdmin,
    requireMembership: true,
  });
  return { user, ...resolved };
}

/** Variant of requireLeagueMember for Server Components. */
export async function requireLeagueMemberFromCookie(
  token: string | undefined,
  slugOrId: string,
): Promise<LeagueScopeResult> {
  const { user } = await requireSessionFromCookie(token);
  const resolved = await resolveLeague(slugOrId, user.userAccount.id, {
    isSuperAdmin: user.userAccount.isSuperAdmin,
    requireMembership: true,
  });
  return { user, ...resolved };
}

/** Require League Admin role (or Super Admin) on the referenced league. */
export async function requireLeagueAdmin(
  req: NextRequest,
  slugOrId: string,
): Promise<LeagueScopeResult> {
  const result = await requireLeagueMember(req, slugOrId);
  if (result.user.userAccount.isSuperAdmin) return result;
  if (!result.membership || result.membership.role !== "admin") {
    throw new NotAuthorisedError("League Admin role required");
  }
  return result;
}

/** Variant of requireLeagueAdmin for Server Components. */
export async function requireLeagueAdminFromCookie(
  token: string | undefined,
  slugOrId: string,
): Promise<LeagueScopeResult> {
  const result = await requireLeagueMemberFromCookie(token, slugOrId);
  if (result.user.userAccount.isSuperAdmin) return result;
  if (!result.membership || result.membership.role !== "admin") {
    throw new NotAuthorisedError("League Admin role required");
  }
  return result;
}
