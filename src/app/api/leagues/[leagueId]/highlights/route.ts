import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { fetchBootstrap, fetchEntryHistory, getCurrentGw } from "@/lib/fpl/client";
import { requireLeagueMember } from "@/lib/authz/league-scope";
import { ok, failFromError } from "@/lib/http/response";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export interface Highlight {
  text: string;
  icon: string;
  type: "positive" | "negative" | "neutral" | "drama";
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

const CHIP_LABELS: Record<string, string> = {
  wildcard: "Wildcard",
  bboost: "Bench Boost",
  "3xc": "Triple Captain",
  freehit: "Free Hit",
};

export async function GET(req: NextRequest, ctx: { params: { leagueId: string } }) {
  try {
    const { league } = await requireLeagueMember(req, ctx.params.leagueId);

    const memberships = await db.leagueMembership.findMany({
      where: { leagueId: league.id, isActive: true },
    });
    if (memberships.length < 2) {
      return ok({ highlights: [] as Highlight[], currentGw: 0 });
    }

    let bootstrap;
    try {
      bootstrap = await fetchBootstrap();
    } catch {
      // Highlights gracefully degrade — return empty rather than error.
      return ok({ highlights: [] as Highlight[], currentGw: 0 });
    }
    const currentGw = getCurrentGw(bootstrap.events);
    if (currentGw < 2) return ok({ highlights: [] as Highlight[], currentGw });

    const managers = await Promise.all(
      memberships.map(async (m) => {
        const h = await fetchEntryHistory(m.managerId);
        const firstName = (m.displayName ?? `Manager ${m.managerId}`).split(" ")[0];
        return {
          managerId: m.managerId,
          displayName: m.displayName ?? `Manager ${m.managerId}`,
          firstName,
          history: h.current,
          chips: h.chips,
          deduction: m.pointsDeductionPerGw,
        };
      }),
    );

    const playedGws = Array.from(new Set(managers.flatMap((m) => m.history.map((e) => e.event))))
      .filter((gw) => gw <= currentGw)
      .sort((a, b) => a - b);

    const orgAvgByGw = new Map<number, number>();
    for (const gw of playedGws) {
      const scores = managers
        .map((m) => {
          const e = m.history.find((h) => h.event === gw);
          return e ? e.points - m.deduction : null;
        })
        .filter((p): p is number => p !== null);
      if (scores.length > 0) orgAvgByGw.set(gw, scores.reduce((s, v) => s + v, 0) / scores.length);
    }

    const orgRank = new Map<number, Map<number, number>>();
    for (const m of managers) orgRank.set(m.managerId, new Map());

    for (const gw of playedGws) {
      const sorted = managers
        .map((m) => {
          const e = m.history.find((h) => h.event === gw);
          return e ? { managerId: m.managerId, total: e.total_points - m.deduction * gw } : null;
        })
        .filter((x): x is { managerId: number; total: number } => x !== null)
        .sort((a, b) => b.total - a.total);
      sorted.forEach((x, i) => orgRank.get(x.managerId)?.set(gw, i + 1));
    }

    const highlights: Highlight[] = [];
    const prevGw = currentGw - 1;

    // 1. Leadership change
    const currentLeader = managers.find((m) => orgRank.get(m.managerId)?.get(currentGw) === 1);
    const prevLeader = managers.find((m) => orgRank.get(m.managerId)?.get(prevGw) === 1);
    if (currentLeader && prevLeader && currentLeader.managerId !== prevLeader.managerId) {
      let weeksAtTop = 0;
      for (let gw = prevGw; gw >= 1; gw--) {
        if (orgRank.get(prevLeader.managerId)?.get(gw) === 1) weeksAtTop++;
        else break;
      }
      if (weeksAtTop >= 2) {
        highlights.push({
          icon: "👑",
          type: "drama",
          text: `${currentLeader.firstName} dethrones ${prevLeader.firstName} at the top — ${prevLeader.firstName} had led for ${weeksAtTop} week${weeksAtTop !== 1 ? "s" : ""}`,
        });
      } else {
        highlights.push({
          icon: "👑",
          type: "drama",
          text: `${currentLeader.firstName} takes the lead from ${prevLeader.firstName}`,
        });
      }
    }

    // 2. Crossovers (omitted if leadership change happened)
    if (!highlights.some((h) => h.icon === "👑")) {
      let crossoverAdded = false;
      for (const a of managers) {
        if (crossoverAdded) break;
        for (const b of managers) {
          if (a.managerId === b.managerId) continue;
          const aPrev = orgRank.get(a.managerId)?.get(prevGw) ?? null;
          const bPrev = orgRank.get(b.managerId)?.get(prevGw) ?? null;
          const aCurr = orgRank.get(a.managerId)?.get(currentGw) ?? null;
          const bCurr = orgRank.get(b.managerId)?.get(currentGw) ?? null;
          if (!aPrev || !bPrev || !aCurr || !bCurr) continue;
          if (aPrev > bPrev && aCurr < bCurr) {
            let gapsAgo = 0;
            for (let gw = prevGw - 1; gw >= 1; gw--) {
              const aR = orgRank.get(a.managerId)?.get(gw) ?? null;
              const bR = orgRank.get(b.managerId)?.get(gw) ?? null;
              if (aR === null || bR === null) break;
              if (aR < bR) break;
              gapsAgo++;
            }
            if (gapsAgo >= 3) {
              highlights.push({
                icon: "⚔️",
                type: "drama",
                text: `${a.firstName} overtook ${b.firstName} for the first time in ${gapsAgo + 1} weeks`,
              });
              crossoverAdded = true;
              break;
            }
          }
        }
      }
    }

    // 3. GW top and bottom scorer
    const currentGwScores = managers
      .map((m) => {
        const e = m.history.find((h) => h.event === currentGw);
        return e ? { managerId: m.managerId, firstName: m.firstName, pts: e.points - m.deduction } : null;
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .sort((a, b) => b.pts - a.pts);

    const orgAvgCurrent = orgAvgByGw.get(currentGw) ?? 0;
    if (currentGwScores.length > 0) {
      const top = currentGwScores[0];
      const aboveAvg = Math.round(top.pts - orgAvgCurrent);
      highlights.push({
        icon: "🏆",
        type: "positive",
        text:
          aboveAvg >= 10
            ? `${top.firstName} topped GW${currentGw} with ${top.pts} pts — ${aboveAvg} above the league average`
            : `${top.firstName} led the league in GW${currentGw} with ${top.pts} pts`,
      });
    }
    if (currentGwScores.length > 1) {
      const bottom = currentGwScores[currentGwScores.length - 1];
      const belowAvg = Math.round(orgAvgCurrent - bottom.pts);
      if (belowAvg >= 10) {
        highlights.push({
          icon: "😬",
          type: "negative",
          text: `${bottom.firstName} had the week to forget — ${bottom.pts} pts, ${belowAvg} below the league average`,
        });
      }
    }

    // 4. Biggest climber / faller
    const rankChanges = managers
      .map((m) => {
        const prev = orgRank.get(m.managerId)?.get(prevGw) ?? null;
        const curr = orgRank.get(m.managerId)?.get(currentGw) ?? null;
        if (prev === null || curr === null) return null;
        return { m, prev, curr, change: prev - curr };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);

    const biggestClimber = rankChanges.filter((x) => x.change >= 2).sort((a, b) => b.change - a.change)[0];
    const biggestFaller = rankChanges.filter((x) => x.change <= -2).sort((a, b) => a.change - b.change)[0];
    const namesAlreadyMentioned = highlights.map((h) => h.text).join(" ").toLowerCase();
    if (biggestClimber && !namesAlreadyMentioned.includes(biggestClimber.m.firstName.toLowerCase())) {
      highlights.push({
        icon: "🚀",
        type: "positive",
        text: `${biggestClimber.m.firstName} climbed ${biggestClimber.change} place${biggestClimber.change !== 1 ? "s" : ""} up to ${ordinal(biggestClimber.curr)} in the league`,
      });
    }
    if (biggestFaller && !namesAlreadyMentioned.includes(biggestFaller.m.firstName.toLowerCase())) {
      highlights.push({
        icon: "📉",
        type: "negative",
        text: `${biggestFaller.m.firstName} fell ${Math.abs(biggestFaller.change)} place${Math.abs(biggestFaller.change) !== 1 ? "s" : ""} — down to ${ordinal(biggestFaller.curr)} in the league`,
      });
    }

    // 5. Above-avg streak
    const streaks: { m: (typeof managers)[0]; streak: number }[] = [];
    for (const m of managers) {
      let streak = 0;
      for (let gw = currentGw; gw >= 1; gw--) {
        const e = m.history.find((h) => h.event === gw);
        const avg = orgAvgByGw.get(gw);
        if (!e || avg === undefined) break;
        if (e.points - m.deduction > avg) streak++;
        else break;
      }
      if (streak >= 3) streaks.push({ m, streak });
    }
    streaks.sort((a, b) => b.streak - a.streak);
    for (const { m, streak } of streaks) {
      const currentNames = highlights.map((h) => h.text).join(" ").toLowerCase();
      if (!currentNames.includes(m.firstName.toLowerCase())) {
        highlights.push({
          icon: "🔥",
          type: "positive",
          text: `${m.firstName} has scored above the league average for ${streak} gameweeks in a row`,
        });
        break;
      }
    }

    // 6. Season-high gap
    const currentTotals = managers
      .map((m) => {
        const e = m.history.find((h) => h.event === currentGw);
        return e ? e.total_points - m.deduction * currentGw : null;
      })
      .filter((t): t is number => t !== null)
      .sort((a, b) => b - a);

    if (currentTotals.length >= 2) {
      const currentGap = currentTotals[0] - currentTotals[currentTotals.length - 1];
      let maxPrevGap = 0;
      for (const gw of playedGws.filter((g) => g < currentGw)) {
        const tops = managers
          .map((m) => {
            const e = m.history.find((h) => h.event === gw);
            return e ? e.total_points - m.deduction * gw : null;
          })
          .filter((t): t is number => t !== null)
          .sort((a, b) => b - a);
        if (tops.length >= 2) maxPrevGap = Math.max(maxPrevGap, tops[0] - tops[tops.length - 1]);
      }
      if (currentGap > maxPrevGap && maxPrevGap > 0) {
        highlights.push({
          icon: "📏",
          type: "drama",
          text: `The gap between 1st and last is now ${currentGap} pts — a season high`,
        });
      } else {
        highlights.push({
          icon: "📏",
          type: "neutral",
          text: `The gap between 1st and last stands at ${currentGap} pts`,
        });
      }
    }

    // 7. Chips played this GW (uses already-fetched history per manager)
    for (const m of managers) {
      const chip = m.chips.find((c) => c.event === currentGw);
      if (chip) {
        const label = CHIP_LABELS[chip.name] ?? chip.name;
        highlights.push({
          icon: "🃏",
          type: "neutral",
          text: `${m.firstName} played their ${label} this gameweek`,
        });
      }
    }

    const priority = ["drama", "positive", "negative", "neutral"];
    const sorted = [...highlights].sort(
      (a, b) => priority.indexOf(a.type) - priority.indexOf(b.type),
    );

    return ok({ highlights: sorted.slice(0, 6), currentGw });
  } catch (err) {
    return failFromError(err);
  }
}
