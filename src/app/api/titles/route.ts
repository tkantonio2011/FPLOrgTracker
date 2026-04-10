import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { fetchBootstrap, fetchEntryHistory, getCurrentGw } from "@/lib/fpl/client";

export const dynamic = "force-dynamic";

export interface ManagerTitle {
  managerId: number;
  title: string;
  description: string;
  colour: string;   // Tailwind bg + text classes for the badge
  border: string;   // Tailwind border class
}

// ── Title definitions ─────────────────────────────────────────────────────────
// Each has a stat key, sort direction, eligibility guard, and display config.
// "competitive" = only one manager can hold this title.
// "qualifying"  = any manager meeting the criteria gets it.

interface TitleDef {
  id: string;
  title: string;
  describe: (val: number, name: string) => string;
  colour: string;
  border: string;
  competitive: boolean;
}

const TITLE_DEFS: TitleDef[] = [
  {
    id: "league_leader",
    title: "The League Leader",
    describe: (pts) => `Top of the org with ${pts} pts`,
    colour: "bg-yellow-100 text-yellow-800",
    border: "border-yellow-300",
    competitive: true,
  },
  {
    id: "rocket",
    title: "The Rocket",
    describe: (pts) => `Season-high single GW score: ${pts} pts`,
    colour: "bg-orange-100 text-orange-800",
    border: "border-orange-300",
    competitive: true,
  },
  {
    id: "bench_billionaire",
    title: "The Bench Billionaire",
    describe: (pts) => `${pts} pts left rotting on the bench — a national tragedy`,
    colour: "bg-amber-100 text-amber-800",
    border: "border-amber-300",
    competitive: true,
  },
  {
    id: "gambler",
    title: "The Gambler",
    describe: (pts) => `Paid ${pts} pts in transfer hits — YOLO`,
    colour: "bg-red-100 text-red-800",
    border: "border-red-300",
    competitive: true,
  },
  {
    id: "tinker_man",
    title: "The Tinker Man",
    describe: (n) => `Made ${n} transfers this season — can't stop, won't stop`,
    colour: "bg-violet-100 text-violet-800",
    border: "border-violet-300",
    competitive: true,
  },
  {
    id: "fossil",
    title: "The Fossil",
    describe: (n) => `Set & forget — ${n} GWs without touching the squad`,
    colour: "bg-stone-100 text-stone-700",
    border: "border-stone-300",
    competitive: true,
  },
  {
    id: "bottler",
    title: "The Bottler",
    describe: (n) => `Propped up the org leaderboard ${n} times — we appreciate the sacrifice`,
    colour: "bg-blue-100 text-blue-800",
    border: "border-blue-300",
    competitive: true,
  },
  {
    id: "consistent",
    title: "Mr. Consistent",
    describe: (sd) => `GW-score std dev of just ${(sd / 10).toFixed(1)} — boring but effective`,
    colour: "bg-slate-100 text-slate-700",
    border: "border-slate-300",
    competitive: true,
  },
  {
    id: "efficient",
    title: "The Efficient Machine",
    describe: (pts) => `Only ${pts} pts wasted on the bench — ruthless`,
    colour: "bg-emerald-100 text-emerald-800",
    border: "border-emerald-300",
    competitive: true,
  },
  // Qualifying (non-competitive)
  {
    id: "safe_hands",
    title: "Safe Pair of Hands",
    describe: () => `Not a single transfer hit taken all season`,
    colour: "bg-teal-100 text-teal-800",
    border: "border-teal-300",
    competitive: false,
  },
];

// Fallback titles for managers not winning any competitive slot
const FALLBACKS = [
  { title: "The Dark Horse",   describe: () => "Quietly lurking in mid-table — don't sleep on them",  colour: "bg-indigo-100 text-indigo-800", border: "border-indigo-300" },
  { title: "The Challenger",   describe: () => "Always threatening, never quite there",               colour: "bg-sky-100 text-sky-800",     border: "border-sky-300"   },
  { title: "The Wildcard",     describe: () => "Unpredictable — could beat anyone on their day",      colour: "bg-fuchsia-100 text-fuchsia-800", border: "border-fuchsia-300" },
  { title: "The Nearly Man",   describe: () => "So close, yet so far",                                colour: "bg-rose-100 text-rose-800",   border: "border-rose-300"  },
  { title: "The Average Joe",  describe: () => "The org average, personified",                        colour: "bg-slate-100 text-slate-600", border: "border-slate-300" },
  { title: "The Sleeping Giant",describe: () => "The potential is there — allegedly",                 colour: "bg-zinc-100 text-zinc-700",   border: "border-zinc-300"  },
];

function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  return Math.round(Math.sqrt(variance) * 10); // ×10 to avoid floats in describe
}

export async function GET() {
  try {
    const org = await db.organisation.findFirst({
      include: { members: { where: { isActive: true } } },
    });
    if (!org || org.members.length === 0) {
      return NextResponse.json(
        { error: "Organisation not configured", code: "ORG_NOT_CONFIGURED" },
        { status: 404 }
      );
    }

    const bootstrap = await fetchBootstrap();
    const currentGw = getCurrentGw(bootstrap.events);

    // ── Collect all manager stats ─────────────────────────────────────────────
    const raw = await Promise.all(
      org.members.map(async (m) => {
        const history = await fetchEntryHistory(m.managerId);
        const played = history.current.filter((e) => e.event <= currentGw);

        const gwScores = played.map((e) => ({ gw: e.event, pts: e.points }));
        const totalBenchPts = played.reduce((s, e) => s + e.points_on_bench, 0);
        const totalHits = played.reduce((s, e) => s + e.event_transfers_cost, 0);
        const totalTransfers = played.reduce((s, e) => s + e.event_transfers, 0);
        const gwsWithoutTransfer = played.filter((e) => e.event_transfers === 0).length;
        const highestGwScore = gwScores.length > 0 ? Math.max(...gwScores.map((s) => s.pts)) : 0;
        const totalPoints = played.length > 0
          ? played[played.length - 1].total_points - (m.pointsDeductionPerGw ?? 0) * played.length
          : 0;
        const scoreStdDev = stdDev(gwScores.map((s) => s.pts));

        return {
          managerId: m.managerId,
          displayName: m.displayName ?? `Manager ${m.managerId}`,
          gwScores,
          totalBenchPts,
          totalHits,
          totalTransfers,
          gwsWithoutTransfer,
          highestGwScore,
          totalPoints,
          scoreStdDev,
          gwsPlayed: played.length,
        };
      })
    );

    // ── Compute "times finished last in org" per manager ─────────────────────
    const gwsFinishedLast = new Map<number, number>(raw.map((m) => [m.managerId, 0]));
    const allGws = Array.from(new Set(raw.flatMap((m) => m.gwScores.map((s) => s.gw))));
    for (const gw of allGws) {
      const gwRow = raw
        .map((m) => ({ id: m.managerId, pts: m.gwScores.find((s) => s.gw === gw)?.pts ?? null }))
        .filter((r): r is { id: number; pts: number } => r.pts !== null);
      if (gwRow.length < 2) continue;
      const minPts = Math.min(...gwRow.map((r) => r.pts));
      for (const r of gwRow) {
        if (r.pts === minPts) {
          gwsFinishedLast.set(r.id, (gwsFinishedLast.get(r.id) ?? 0) + 1);
        }
      }
    }

    // ── Build competitive ranking maps ────────────────────────────────────────
    // stat key → array of [managerId, statValue] sorted best-first
    const sortedBy = {
      league_leader:    [...raw].sort((a, b) => b.totalPoints - a.totalPoints),
      rocket:           [...raw].sort((a, b) => b.highestGwScore - a.highestGwScore),
      bench_billionaire:[...raw].sort((a, b) => b.totalBenchPts - a.totalBenchPts),
      gambler:          [...raw].sort((a, b) => b.totalHits - a.totalHits),
      tinker_man:       [...raw].sort((a, b) => b.totalTransfers - a.totalTransfers),
      fossil:           [...raw].sort((a, b) => b.gwsWithoutTransfer - a.gwsWithoutTransfer),
      bottler:          [...raw].sort((a, b) =>
        (gwsFinishedLast.get(b.managerId) ?? 0) - (gwsFinishedLast.get(a.managerId) ?? 0)
      ),
      consistent:       [...raw].sort((a, b) => a.scoreStdDev - b.scoreStdDev),
      efficient:        [...raw].sort((a, b) => a.totalBenchPts - b.totalBenchPts),
    } as const;

    // ── Assign titles ─────────────────────────────────────────────────────────
    const assigned = new Map<number, ManagerTitle>(); // managerId → title

    for (const def of TITLE_DEFS) {
      if (!def.competitive) continue;

      const key = def.id as keyof typeof sortedBy;
      const ranking = sortedBy[key];
      if (!ranking) continue;

      const winner = ranking[0];
      if (!winner || assigned.has(winner.managerId)) continue;

      // Guard: skip if the stat is trivially zero / no real winner
      if (def.id === "gambler" && winner.totalHits === 0) continue;
      if (def.id === "bench_billionaire" && winner.totalBenchPts === 0) continue;
      if (def.id === "bottler" && (gwsFinishedLast.get(winner.managerId) ?? 0) === 0) continue;

      let statVal = 0;
      if (def.id === "league_leader")    statVal = winner.totalPoints;
      if (def.id === "rocket")           statVal = winner.highestGwScore;
      if (def.id === "bench_billionaire")statVal = winner.totalBenchPts;
      if (def.id === "gambler")          statVal = winner.totalHits;
      if (def.id === "tinker_man")       statVal = winner.totalTransfers;
      if (def.id === "fossil")           statVal = winner.gwsWithoutTransfer;
      if (def.id === "bottler")          statVal = gwsFinishedLast.get(winner.managerId) ?? 0;
      if (def.id === "consistent")       statVal = winner.scoreStdDev;
      if (def.id === "efficient")        statVal = winner.totalBenchPts;

      assigned.set(winner.managerId, {
        managerId: winner.managerId,
        title: def.title,
        description: def.describe(statVal, winner.displayName),
        colour: def.colour,
        border: def.border,
      });
    }

    // Safe Pair of Hands — all managers with zero hits
    for (const m of raw) {
      if (!assigned.has(m.managerId) && m.totalHits === 0 && m.gwsPlayed >= 3) {
        const def = TITLE_DEFS.find((d) => d.id === "safe_hands")!;
        assigned.set(m.managerId, {
          managerId: m.managerId,
          title: def.title,
          description: def.describe(0, m.displayName),
          colour: def.colour,
          border: def.border,
        });
      }
    }

    // Fallbacks — rotate through for remaining managers
    let fallbackIdx = 0;
    for (const m of [...raw].sort((a, b) => b.totalPoints - a.totalPoints)) {
      if (!assigned.has(m.managerId)) {
        const fb = FALLBACKS[fallbackIdx % FALLBACKS.length];
        fallbackIdx++;
        assigned.set(m.managerId, {
          managerId: m.managerId,
          title: fb.title,
          description: fb.describe(),
          colour: fb.colour,
          border: fb.border,
        });
      }
    }

    return NextResponse.json({ titles: Array.from(assigned.values()) });
  } catch (err) {
    console.error("[GET /api/titles]", err);
    return NextResponse.json(
      { error: "Failed to compute titles", code: "FPL_ERROR" },
      { status: 500 }
    );
  }
}
