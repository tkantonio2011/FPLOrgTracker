/**
 * Returns the current user — derived purely from the new (multi-league)
 * session cookie. Back-compat shape (`managerId` / `displayName` /
 * `teamName`) is hydrated from the user's first active membership, with
 * the structured `userAccount` + `memberships[]` fields available for
 * new code.
 */

import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getServerUser } from "@/lib/auth/current-user";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface CompatBody {
  managerId: number | null;
  displayName: string | null;
  teamName: string | null;
  userAccount: {
    id: string;
    email: string;
    displayName: string | null;
    isSuperAdmin: boolean;
  };
  memberships: Array<{
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
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const memberships = await db.leagueMembership.findMany({
    where: { userAccountId: user.userAccount.id, isActive: true },
    include: { league: true },
    orderBy: { addedAt: "asc" },
  });
  const primary = memberships[0];
  const body: CompatBody = {
    managerId: primary?.managerId ?? null,
    displayName: primary?.displayName ?? user.userAccount.displayName,
    teamName: primary?.teamName ?? null,
    userAccount: {
      id: user.userAccount.id,
      email: user.userAccount.email,
      displayName: user.userAccount.displayName,
      isSuperAdmin: user.userAccount.isSuperAdmin,
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
