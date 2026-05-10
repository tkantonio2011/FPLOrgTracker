/**
 * League sync — re-import members from the configured FPL classic mini-league.
 *
 * POST — League Admin only. Refreshes `teamName` (and `displayName` when blank)
 *        for existing memberships, and creates new league-sourced memberships
 *        for managers in the FPL standings that aren't already in the league.
 *        Members with `source` of `manual` or `invitation` are NEVER touched
 *        by sync; admins manage them via the members page.
 *
 * Contract: specs/002-multi-league-platform/contracts/league-contracts.md
 */

import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireLeagueAdmin } from "@/lib/authz/league-scope";
import { ok, fail, failFromError } from "@/lib/http/response";
import { logAuditEvent } from "@/lib/audit/log";
import { fetchAllLeagueStandings, FplApiError } from "@/lib/fpl/client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest, ctx: { params: { leagueId: string } }) {
  try {
    const { league, user } = await requireLeagueAdmin(req, ctx.params.leagueId);

    if (!league.miniLeagueId) {
      return fail("League has no FPL mini-league ID configured", 422);
    }

    let standings;
    try {
      standings = await fetchAllLeagueStandings(league.miniLeagueId);
    } catch (err) {
      if (err instanceof FplApiError) {
        if (err.status === 404 || err.status === 403) {
          return fail("Mini-league is private or not found", 422);
        }
        return fail("FPL API unavailable, please try again", 503);
      }
      throw err;
    }

    if (standings.length === 0) {
      return fail("Mini-league is private or not found", 422);
    }

    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;

    let added = 0;
    let refreshed = 0;

    // Pre-load existing memberships for this league so we can reconcile in
    // a single pass without per-row roundtrips on the read path.
    const existingMemberships = await db.leagueMembership.findMany({
      where: { leagueId: league.id },
      select: { id: true, managerId: true, displayName: true, teamName: true },
    });
    const byManagerId = new Map(existingMemberships.map((m) => [m.managerId, m]));

    for (const entry of standings) {
      const existing = byManagerId.get(entry.entry);
      if (existing) {
        // Refresh teamName always; refresh displayName only if currently blank
        // (admins may have customised it — don't overwrite a deliberate rename).
        const updates: Record<string, unknown> = {};
        if (entry.entry_name && existing.teamName !== entry.entry_name) {
          updates.teamName = entry.entry_name;
        }
        if (!existing.displayName && entry.player_name) {
          updates.displayName = entry.player_name;
        }
        if (Object.keys(updates).length > 0) {
          await db.leagueMembership.update({ where: { id: existing.id }, data: updates });
          refreshed++;
        }
      } else {
        const created = await db.leagueMembership.create({
          data: {
            leagueId: league.id,
            managerId: entry.entry,
            displayName: entry.player_name ?? null,
            teamName: entry.entry_name ?? null,
            role: "member",
            source: "league",
            isActive: true,
            addedByUserAccountId: user.userAccount.id,
          },
        });
        await logAuditEvent({
          leagueId: league.id,
          actorUserAccountId: user.userAccount.id,
          action: "membership.added",
          targetKind: "membership",
          targetId: created.id,
          details: { managerId: entry.entry, source: "league" },
          requestIp: ip,
        });
        added++;
      }
    }

    const total = await db.leagueMembership.count({
      where: { leagueId: league.id, isActive: true },
    });

    return ok({ added, refreshed, total });
  } catch (err) {
    return failFromError(err);
  }
}
