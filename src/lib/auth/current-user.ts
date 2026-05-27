/**
 * The single helper used by every page loader and route handler to resolve
 * the current user. Returns null if not signed in.
 *
 * Loads the UserAccount with a summary of memberships and SuperAdmin status,
 * which is the most common shape needed downstream.
 */

import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getSessionFromRequest, getSessionFromToken } from "@/lib/auth/session";

export interface MembershipSummary {
  leagueId: string;
  leagueSlug: string;
  leagueName: string;
  leagueLogoUrl: string | null;
  leagueStatus: "active" | "suspended";
  role: "member" | "admin";
  isActive: boolean;
}

export interface CurrentUser {
  sessionId: string;
  userAccount: {
    id: string;
    email: string;
    displayName: string | null;
    isSuperAdmin: boolean;
    disabledAt: Date | null;
  };
  memberships: MembershipSummary[];
}

async function loadCurrentUser(
  resolved: { sessionId: string; userAccountId: string } | null,
): Promise<CurrentUser | null> {
  if (!resolved) return null;
  const account = await db.userAccount.findUnique({
    where: { id: resolved.userAccountId },
    include: {
      superAdmin: true,
      memberships: {
        include: { league: true },
      },
    },
  });
  if (!account) return null;
  if (account.disabledAt) return null;

  const isSuperAdmin = !!account.superAdmin && !account.superAdmin.revokedAt;

  const memberships: MembershipSummary[] = account.memberships.map((m) => ({
    leagueId: m.leagueId,
    leagueSlug: m.league.slug,
    leagueName: m.league.name,
    leagueLogoUrl: m.league.logoUrl,
    leagueStatus: (m.league.status === "suspended" ? "suspended" : "active") as "active" | "suspended",
    role: (m.role === "admin" ? "admin" : "member") as "member" | "admin",
    isActive: m.isActive,
  }));

  return {
    sessionId: resolved.sessionId,
    userAccount: {
      id: account.id,
      email: account.email,
      displayName: account.displayName,
      isSuperAdmin,
      disabledAt: account.disabledAt,
    },
    memberships,
  };
}

/** Resolve the current user from a NextRequest (route handlers, middleware). */
export async function getServerUser(req: NextRequest): Promise<CurrentUser | null> {
  const resolved = await getSessionFromRequest(req);
  return loadCurrentUser(resolved);
}

/**
 * Resolve from a raw cookie value (Server Components: pass
 * `cookies().get(SESSION_COOKIE_NAME)?.value`).
 */
export async function getServerUserFromCookie(token: string | undefined): Promise<CurrentUser | null> {
  const resolved = await getSessionFromToken(token);
  return loadCurrentUser(resolved);
}
