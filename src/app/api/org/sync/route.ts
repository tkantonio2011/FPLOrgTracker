import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { fetchAllLeagueStandings, fetchEntry } from "@/lib/fpl/client";
import { isAdminRequest } from "@/lib/admin-auth";

export async function POST(req: NextRequest) {
  if (!isAdminRequest(req)) {
    return NextResponse.json({ error: "Unauthorised", code: "UNAUTHORISED" }, { status: 401 });
  }
  try {
    // Allow the client to pass the current form's miniLeagueId directly so
    // sync always uses what the admin typed, even before explicitly saving.
    let body: { miniLeagueId?: number } = {};
    try { body = await req.json(); } catch { /* no body */ }

    let org = await db.organisation.findFirst();
    if (!org) {
      return NextResponse.json({ error: "Organisation not configured", code: "ORG_NOT_CONFIGURED" }, { status: 404 });
    }

    // If the client sent a miniLeagueId, persist it now so the sync and the
    // DB are always in sync (pun intended).
    if (body.miniLeagueId && body.miniLeagueId !== org.miniLeagueId) {
      org = await db.organisation.update({
        where: { id: org.id },
        data: { miniLeagueId: body.miniLeagueId },
      });
    }

    const leagueId = body.miniLeagueId ?? org.miniLeagueId;
    if (!leagueId) {
      return NextResponse.json({ error: "No mini-league ID configured", code: "NO_LEAGUE_ID" }, { status: 422 });
    }

    const standings = await fetchAllLeagueStandings(leagueId);
    const leagueManagerIds = new Set(standings.map((e) => e.entry));

    let added = 0;
    let reactivated = 0;
    let removed = 0;

    for (const entry of standings) {
      const existing = await db.member.findUnique({ where: { managerId: entry.entry } });
      if (!existing) {
        await db.member.create({
          data: {
            managerId: entry.entry,
            displayName: entry.player_name,
            teamName: entry.entry_name,
            source: "league",
            isActive: true,
            organisationId: org.id,
          },
        });
        added++;
      } else if (!existing.isActive) {
        await db.member.update({
          where: { id: existing.id },
          data: { isActive: true, source: "league", teamName: entry.entry_name, displayName: entry.player_name },
        });
        reactivated++;
      } else {
        // Keep display name / team name up to date
        await db.member.update({
          where: { id: existing.id },
          data: { teamName: entry.entry_name, displayName: entry.player_name },
        });
      }
    }

    // Deactivate league-sourced members no longer in the league results.
    // Manually-added members (source !== "league") are left untouched.
    const staleLeagueMembers = await db.member.findMany({
      where: { organisationId: org.id, isActive: true, source: "league" },
    });
    for (const m of staleLeagueMembers) {
      if (!leagueManagerIds.has(m.managerId)) {
        await db.member.update({ where: { id: m.id }, data: { isActive: false } });
        removed++;
      }
    }

    const total = await db.member.count({ where: { organisationId: org.id, isActive: true } });
    return NextResponse.json({ added, reactivated, removed, total });
  } catch (err) {
    console.error("Sync error:", err);
    return NextResponse.json({ error: "Sync failed", code: "FPL_API_UNAVAILABLE" }, { status: 503 });
  }
}
