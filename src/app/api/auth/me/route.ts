/**
 * Returns the current user. Compatible with both:
 *  - new (multi-league) sessions — derives a back-compat `managerId` /
 *    `displayName` / `teamName` from the user's first active membership;
 *  - legacy single-tenant `user_session` cookies — looks up the legacy User
 *    record. Returns the same back-compat shape.
 *
 * The legacy code (e.g. `LandingPage.tsx`) reads only `managerId` /
 * `displayName`. New code can read the additional `userAccount` and
 * `memberships[]` fields.
 */

import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getServerUser } from "@/lib/auth/current-user";
import { getSessionManagerId } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface CompatBody {
  managerId: number | null;
  displayName: string | null;
  teamName: string | null;
  userAccount?: {
    id: string;
    email: string;
    displayName: string | null;
    isSuperAdmin: boolean;
  };
  memberships?: Array<{
    leagueId: string;
    leagueSlug: string;
    leagueName: string;
    leagueLogoUrl: string | null;
    leagueStatus: "active" | "suspended";
    role: "member" | "admin";
    isActive: boolean;
    managerId: number;
  }>;
}

export async function GET(req: NextRequest) {
  // Prefer the new session.
  const newUser = await getServerUser(req);
  if (newUser) {
    // Hydrate per-membership managerId for the back-compat shape.
    const memberships = await db.leagueMembership.findMany({
      where: { userAccountId: newUser.userAccount.id, isActive: true },
      include: { league: true },
      orderBy: { addedAt: "asc" },
    });
    const primary = memberships[0];
    const body: CompatBody = {
      managerId: primary?.managerId ?? null,
      displayName: primary?.displayName ?? newUser.userAccount.displayName,
      teamName: primary?.teamName ?? null,
      userAccount: {
        id: newUser.userAccount.id,
        email: newUser.userAccount.email,
        displayName: newUser.userAccount.displayName,
        isSuperAdmin: newUser.userAccount.isSuperAdmin,
      },
      memberships: memberships.map((m) => ({
        leagueId: m.leagueId,
        leagueSlug: m.league.slug,
        leagueName: m.league.name,
        leagueLogoUrl: m.league.logoUrl,
        leagueStatus: (m.league.status === "suspended" ? "suspended" : "active") as "active" | "suspended",
        role: (m.role === "admin" ? "admin" : "member") as "member" | "admin",
        isActive: m.isActive,
        managerId: m.managerId,
      })),
    };
    return NextResponse.json(body);
  }

  // Fallback: legacy session.
  const managerId = getSessionManagerId(req);
  if (!managerId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const user = await db.user.findUnique({
    where: { managerId },
    include: { member: { select: { displayName: true, teamName: true, isActive: true } } },
  });
  if (!user || !user.member.isActive) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const body: CompatBody = {
    managerId,
    displayName: user.member.displayName,
    teamName: user.member.teamName,
  };
  return NextResponse.json(body);
}
