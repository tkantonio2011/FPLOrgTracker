"use client";

import { useQuery } from "@tanstack/react-query";

const POSITION_LABEL: Record<number, string> = { 1: "GK", 2: "DEF", 3: "MID", 4: "FWD" };
const POSITION_COLOUR: Record<number, string> = {
  1: "bg-yellow-100 text-yellow-700",
  2: "bg-blue-100 text-blue-700",
  3: "bg-emerald-100 text-emerald-700",
  4: "bg-red-100 text-red-700",
};

const STATUS_META: Record<string, { label: string; colour: string; dot: string }> = {
  i: { label: "Injured",     colour: "bg-red-100 text-red-700 border-red-200",     dot: "bg-red-500"    },
  s: { label: "Suspended",   colour: "bg-red-100 text-red-700 border-red-200",     dot: "bg-red-500"    },
  u: { label: "Unavailable", colour: "bg-red-100 text-red-700 border-red-200",     dot: "bg-red-500"    },
  n: { label: "Not in squad",colour: "bg-slate-100 text-slate-600 border-slate-200", dot: "bg-slate-400" },
  d: { label: "Doubtful",    colour: "bg-amber-100 text-amber-700 border-amber-200", dot: "bg-amber-400" },
};

interface OwnerEntry {
  name: string;
  isCaptain: boolean;
  isViceCaptain: boolean;
  isStarting: boolean;
}

interface PlayerAlert {
  playerId: number;
  webName: string;
  fullName: string;
  team: string;
  elementType: number;
  status: "d" | "i" | "s" | "u" | "n";
  news: string;
  newsAdded: string | null;
  chanceThisRound: number | null;
  chanceNextRound: number | null;
  nowCost: number;
  owners: OwnerEntry[];
  ownerCount: number;
  captainedBy: string[];
  viceCaptainedBy: string[];
}

interface PlayerStatusResponse {
  gameweekId: number;
  gameweekName: string;
  deadlineTime: string | null;
  totalMembers: number;
  alerts: PlayerAlert[];
  allClear: boolean;
}

function ChanceBar({ chance }: { chance: number | null }) {
  if (chance === null) return null;
  const colour =
    chance >= 75 ? "bg-emerald-400"
    : chance >= 50 ? "bg-amber-400"
    : chance >= 25 ? "bg-orange-500"
    : "bg-red-500";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden max-w-[80px]">
        <div className={`h-full rounded-full ${colour}`} style={{ width: `${chance}%` }} />
      </div>
      <span className={`text-xs font-bold tabular-nums ${colour.replace("bg-", "text-")}`}>
        {chance}%
      </span>
    </div>
  );
}

function formatNewsAge(newsAdded: string | null): string {
  if (!newsAdded) return "";
  const diff = Date.now() - new Date(newsAdded).getTime();
  const hours = Math.floor(diff / 3_600_000);
  const days = Math.floor(hours / 24);
  if (days >= 1) return `${days}d ago`;
  if (hours >= 1) return `${hours}h ago`;
  return "just now";
}

function formatDeadline(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function AlertCard({ alert }: { alert: PlayerAlert }) {
  const meta = STATUS_META[alert.status] ?? STATUS_META.d;
  const isOut = alert.status !== "d";

  return (
    <div className={`bg-white border rounded-xl px-4 py-4 shadow-card ${isOut ? "border-red-200" : "border-amber-200"}`}>
      <div className="flex items-start gap-3">
        {/* Status dot */}
        <div className={`w-2.5 h-2.5 rounded-full shrink-0 mt-1.5 ${meta.dot}`} />

        <div className="flex-1 min-w-0 space-y-2.5">
          {/* Player header */}
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${POSITION_COLOUR[alert.elementType]}`}>
                {POSITION_LABEL[alert.elementType]}
              </span>
              <span className="text-base font-black text-slate-900">{alert.webName}</span>
              <span className="text-sm text-slate-400 font-medium">{alert.team}</span>
              <span className="text-xs text-slate-400">£{(alert.nowCost / 10).toFixed(1)}m</span>
            </div>

            <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
              {/* Captain / VC warning badges */}
              {alert.captainedBy.length > 0 && (
                <span className="text-[10px] font-bold bg-purple-100 text-purple-700 border border-purple-200 px-2 py-1 rounded-full uppercase tracking-wide">
                  © {alert.captainedBy.join(", ")}
                </span>
              )}
              {alert.viceCaptainedBy.length > 0 && (
                <span className="text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200 px-2 py-1 rounded-full uppercase tracking-wide">
                  V© {alert.viceCaptainedBy.join(", ")}
                </span>
              )}
              {/* Status badge */}
              <span className={`text-[10px] font-bold px-2 py-1 rounded-full border ${meta.colour}`}>
                {meta.label}
              </span>
            </div>
          </div>

          {/* News */}
          {alert.news && (
            <div className="flex items-start gap-2">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 mt-0.5 text-slate-400">
                <circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>
              </svg>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-slate-600 leading-relaxed">{alert.news}</p>
                {alert.newsAdded && (
                  <p className="text-[10px] text-slate-400 mt-0.5">{formatNewsAge(alert.newsAdded)}</p>
                )}
              </div>
            </div>
          )}

          {/* Chance of playing */}
          {(alert.chanceThisRound !== null || alert.chanceNextRound !== null) && (
            <div className="flex items-center gap-4 flex-wrap">
              {alert.chanceThisRound !== null && (
                <div>
                  <p className="text-[10px] text-slate-400 mb-1 font-medium uppercase tracking-wide">This GW</p>
                  <ChanceBar chance={alert.chanceThisRound} />
                </div>
              )}
              {alert.chanceNextRound !== null && (
                <div>
                  <p className="text-[10px] text-slate-400 mb-1 font-medium uppercase tracking-wide">Next GW</p>
                  <ChanceBar chance={alert.chanceNextRound} />
                </div>
              )}
            </div>
          )}

          {/* Owners */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] text-slate-400 font-medium uppercase tracking-wide shrink-0">
              {alert.ownerCount === 1 ? "1 owner" : `${alert.ownerCount} owners`}:
            </span>
            {alert.owners.map((o) => (
              <span
                key={o.name}
                className={`text-[10px] font-medium px-2 py-1 rounded-full border whitespace-nowrap ${
                  o.isCaptain
                    ? "bg-purple-50 text-purple-700 border-purple-200"
                    : o.isViceCaptain
                    ? "bg-slate-100 text-slate-600 border-slate-200"
                    : o.isStarting
                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                    : "bg-slate-50 text-slate-500 border-slate-200"
                }`}
              >
                {o.name}
                {o.isCaptain ? " ©" : o.isViceCaptain ? " V©" : !o.isStarting ? " (bench)" : ""}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function PlayerStatusPage() {
  const { data, isLoading, isError } = useQuery<PlayerStatusResponse>({
    queryKey: ["player-status"],
    queryFn: async () => {
      const r = await fetch("/api/player-status");
      const json = await r.json();
      if (!r.ok) throw json;
      return json;
    },
    staleTime: 300_000,
    refetchInterval: 600_000, // Refresh every 10 min — injury news changes
  });

  const outAlerts   = data?.alerts.filter((a) => a.status !== "d") ?? [];
  const doubtAlerts = data?.alerts.filter((a) => a.status === "d") ?? [];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Injury &amp; Doubt Tracker</h1>
          <p className="text-sm text-slate-400 mt-0.5">
            {data
              ? `${data.gameweekName} · org-owned players with FPL flags`
              : "Org-owned players with injury or availability concerns"}
          </p>
        </div>
        {data?.deadlineTime && (
          <div className="text-right shrink-0">
            <p className="text-xs text-slate-400">Next deadline</p>
            <p className="text-sm font-semibold text-slate-700">{formatDeadline(data.deadlineTime)}</p>
          </div>
        )}
      </div>

      {isLoading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-32 bg-white border border-slate-200/80 rounded-xl animate-pulse shadow-card" />
          ))}
        </div>
      )}

      {isError && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          Unable to load player status. The FPL API may be temporarily unavailable.
        </div>
      )}

      {/* All clear */}
      {data?.allClear && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-5 py-8 text-center shadow-card">
          <div className="flex items-center justify-center gap-2 mb-2">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-600">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
              <path d="m9 11 3 3L22 4"/>
            </svg>
            <p className="text-base font-bold text-emerald-800">All clear</p>
          </div>
          <p className="text-sm text-emerald-700">
            No injury or doubt flags on any org-owned players right now.
          </p>
        </div>
      )}

      {data && !data.allClear && (
        <>
          {/* Summary counts */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 shadow-card text-center">
              <p className="text-2xl font-black text-red-600 tabular-nums">{outAlerts.length}</p>
              <p className="text-xs font-medium text-red-500 mt-0.5">Out / Suspended</p>
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 shadow-card text-center">
              <p className="text-2xl font-black text-amber-600 tabular-nums">{doubtAlerts.length}</p>
              <p className="text-xs font-medium text-amber-500 mt-0.5">Doubtful</p>
            </div>
            <div className="bg-white border border-slate-200/80 rounded-xl px-4 py-3 shadow-card text-center">
              <p className="text-2xl font-black text-slate-700 tabular-nums">{data.alerts.length}</p>
              <p className="text-xs font-medium text-slate-400 mt-0.5">Total flags</p>
            </div>
          </div>

          {/* Out / Unavailable section */}
          {outAlerts.length > 0 && (
            <section className="space-y-2.5">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500 shrink-0" />
                <h2 className="text-sm font-bold text-red-700 uppercase tracking-wide">
                  Out / Unavailable ({outAlerts.length})
                </h2>
              </div>
              {outAlerts.map((a) => <AlertCard key={a.playerId} alert={a} />)}
            </section>
          )}

          {/* Doubtful section */}
          {doubtAlerts.length > 0 && (
            <section className="space-y-2.5">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-400 shrink-0" />
                <h2 className="text-sm font-bold text-amber-700 uppercase tracking-wide">
                  Doubtful ({doubtAlerts.length})
                </h2>
              </div>
              {doubtAlerts.map((a) => <AlertCard key={a.playerId} alert={a} />)}
            </section>
          )}

          <p className="text-xs text-slate-400 text-center pt-1">
            Data from FPL · refreshes every 10 minutes · always check the official FPL app before the deadline
          </p>
        </>
      )}
    </div>
  );
}
