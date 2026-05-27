"use client";

import { useQuery } from "@tanstack/react-query";
import { useLeague } from "@/components/league/LeagueProvider";

import { HelpButton } from "@/components/manual/HelpButton";
interface GwScore {
  gw: number;
  pts: number | null;
}

interface ManagerForm {
  managerId: number;
  displayName: string;
  teamName: string;
  formGws: GwScore[];
  formTotal: number;
  overallTotal: number;
  gwsPlayed: number;
  formRank: number;
  overallRank: number;
  formVsOverall: number;
}

interface FormResponse {
  managers: ManagerForm[];
  formWindow: number;
  formGws: number[];
  gwAverages: { gw: number; avg: number }[];
  currentGw: number;
}

function formLabel(pts: (number | null)[], avgs: number[]): "hot" | "cold" | "mixed" | "steady" {
  const valid = pts.filter((p): p is number => p !== null);
  if (valid.length === 0) return "steady";
  const aboves = valid.filter((p, i) => p > (avgs[i] ?? 0)).length;
  const belows = valid.filter((p, i) => p < (avgs[i] ?? 0)).length;
  if (aboves === valid.length) return "hot";
  if (belows === valid.length) return "cold";
  if (aboves > belows) return "mixed";
  return "mixed";
}

const FORM_BADGE: Record<"hot" | "cold" | "mixed" | "steady", { label: string; bg: string; text: string; dot: string }> = {
  hot: { label: "On fire", bg: "bg-orange-100", text: "text-orange-700", dot: "bg-orange-500" },
  cold: { label: "Struggling", bg: "bg-blue-100", text: "text-blue-600", dot: "bg-blue-400" },
  mixed: { label: "Patchy", bg: "bg-amber-100", text: "text-amber-700", dot: "bg-amber-400" },
  steady: { label: "Steady", bg: "bg-slate-100", text: "text-slate-500", dot: "bg-slate-300" },
};

function TrendArrow({ delta }: { delta: number }) {
  if (delta === 0) return <span className="text-xs text-slate-400 font-medium tabular-nums">—</span>;
  const up = delta > 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-bold tabular-nums ${up ? "text-emerald-600" : "text-red-500"}`}>
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className={up ? "" : "rotate-180"}>
        <path d="m18 15-6-6-6 6" />
      </svg>
      {Math.abs(delta)}
    </span>
  );
}

function ScorePill({ pts, avg, isBest, isWorst }: { pts: number | null; avg: number; isBest: boolean; isWorst: boolean }) {
  if (pts === null) {
    return <span className="inline-flex items-center justify-center w-10 h-7 rounded-lg bg-slate-50 text-xs text-slate-300 font-medium border border-slate-100">—</span>;
  }
  const above = pts > avg;
  const below = pts < avg;
  const bg = isBest ? "bg-emerald-100 border-emerald-300 text-emerald-700"
    : isWorst ? "bg-red-100 border-red-300 text-red-600"
    : above ? "bg-emerald-50 border-emerald-200 text-emerald-700"
    : below ? "bg-red-50 border-red-200 text-red-500"
    : "bg-slate-100 border-slate-200 text-slate-600";
  return <span className={`inline-flex items-center justify-center w-10 h-7 rounded-lg text-xs font-bold tabular-nums border ${bg}`}>{pts}</span>;
}

function Sparkline({ scores }: { scores: GwScore[] }) {
  const W = 44;
  const H = 22;
  const PAD = 3;
  const valid = scores.filter((s): s is { gw: number; pts: number } => s.pts !== null);
  if (valid.length < 2) return <div style={{ width: W, height: H }} />;
  const vals = valid.map((s) => s.pts);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const range = Math.max(max - min, 1);
  const toY = (p: number) => PAD + ((max - p) / range) * (H - PAD * 2);
  const xStep = (W - PAD * 2) / Math.max(valid.length - 1, 1);
  const toX = (i: number) => PAD + i * xStep;
  const points = valid.map((s, i) => ({ x: toX(i), y: toY(s.pts), pts: s.pts }));
  const trend = valid[valid.length - 1].pts > valid[0].pts ? "up" : valid[valid.length - 1].pts < valid[0].pts ? "down" : "flat";
  const colour = trend === "up" ? "#10b981" : trend === "down" ? "#f43f5e" : "#94a3b8";
  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const areaPath = `${linePath} L${points[points.length - 1].x.toFixed(1)},${H} L${points[0].x.toFixed(1)},${H} Z`;
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden="true" style={{ overflow: "visible" }}>
      <path d={areaPath} fill={colour} fillOpacity={0.1} />
      <path d={linePath} fill="none" stroke={colour} strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" />
      {points.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={2.2} fill={colour} />)}
    </svg>
  );
}

export default function FormPage() {
  const { league } = useLeague();
  const { data, isLoading, isError } = useQuery<FormResponse>({
    queryKey: ["form", league.id],
    queryFn: async () => {
      const r = await fetch(`/api/leagues/${league.id}/form`);
      const body = await r.json();
      if (!r.ok || !body.success) throw body;
      return body.data;
    },
    staleTime: 300_000,
  });

  const avgMap = new Map(data?.gwAverages.map((a) => [a.gw, a.avg]) ?? []);
  const formTotals = data?.managers.map((m) => m.formTotal) ?? [];
  const maxFormTotal = Math.max(...formTotals, 1);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Form Table</h1>
        <HelpButton topic="/help/reading-the-app/form-table" />
        <p className="text-sm text-slate-400 mt-0.5">
          {data && data.formGws.length > 0
            ? `Ranked by last ${data.formWindow} completed gameweeks · GW${data.formGws[0]}–GW${data.formGws[data.formGws.length - 1]}`
            : "Rankings based on the last 3 gameweeks only"}
        </p>
      </div>

      {isLoading && (
        <div className="bg-white border border-slate-200/80 rounded-xl shadow-card animate-pulse">
          <div className="px-5 py-3 border-b border-slate-100 bg-slate-50/60 h-10" />
          <div className="divide-y divide-slate-50">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="px-5 py-4 flex gap-4">
                <div className="h-4 bg-slate-100 rounded w-6 shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3.5 bg-slate-100 rounded w-32" />
                  <div className="h-3 bg-slate-100 rounded w-20" />
                </div>
                <div className="flex gap-2">{[1, 2, 3].map((j) => <div key={j} className="h-7 w-10 bg-slate-100 rounded-lg" />)}</div>
                <div className="h-6 bg-slate-100 rounded w-14" />
              </div>
            ))}
          </div>
        </div>
      )}
      {isError && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          Unable to load form data. The FPL API may be temporarily unavailable.
        </div>
      )}

      {data && data.managers.length > 0 && data.formGws.length > 0 && (
        <>
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-xs font-medium text-slate-500">League avg:</span>
            {data.gwAverages.map((a) => (
              <span key={a.gw} className="text-xs text-slate-600">GW{a.gw}: <span className="font-semibold">{a.avg}pts</span></span>
            ))}
            <span className="text-xs text-slate-400 ml-1">(green = above avg · red = below)</span>
          </div>

          <div className="bg-white border border-slate-200/80 rounded-xl overflow-hidden shadow-card">
            <div className="hidden sm:flex items-center px-5 py-2.5 border-b border-slate-100 bg-slate-50/60 gap-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">
              <span className="w-8 shrink-0 text-center">Form</span>
              <span className="flex-1">Manager</span>
              <span className="w-11 text-center shrink-0">Trend</span>
              {data.formGws.map((gw) => <span key={gw} className="w-10 text-center shrink-0">GW{gw}</span>)}
              <span className="w-16 text-right shrink-0">3-GW pts</span>
              <span className="w-20 text-right shrink-0">vs league</span>
            </div>
            <div className="divide-y divide-slate-50">
              {data.managers.map((m) => {
                const isFirst = m.formRank === 1;
                const isLast = m.formRank === data.managers.length;
                const formAvgs = data.formGws.map((gw) => avgMap.get(gw) ?? 0);
                const label = formLabel(m.formGws.map((g) => g.pts), formAvgs);
                const badge = FORM_BADGE[label];
                const barPct = Math.round((m.formTotal / maxFormTotal) * 100);
                return (
                  <div key={m.managerId} className={`px-4 sm:px-5 py-3.5 ${isFirst ? "bg-orange-50/40" : isLast ? "bg-blue-50/30" : ""}`}>
                    <div className="hidden sm:flex items-center gap-3">
                      <div className="w-8 shrink-0 text-center">
                        <span className={`text-sm font-black ${isFirst ? "text-orange-500" : isLast ? "text-blue-400" : "text-slate-600"}`}>{m.formRank}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-semibold text-slate-800 truncate">{m.displayName}</span>
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${badge.bg} ${badge.text} shrink-0`}>{badge.label}</span>
                        </div>
                        <div className="h-1 w-full bg-slate-100 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full transition-all duration-500 ${isFirst ? "bg-orange-400" : label === "cold" ? "bg-blue-300" : "bg-violet-400"}`} style={{ width: `${barPct}%` }} />
                        </div>
                      </div>
                      <div className="w-11 shrink-0 flex items-center justify-center"><Sparkline scores={m.formGws} /></div>
                      {data.formGws.map((gw) => {
                        const score = m.formGws.find((g) => g.gw === gw);
                        const avg = avgMap.get(gw) ?? 0;
                        const allPtsThisGw = data.managers.map((mg) => mg.formGws.find((g) => g.gw === gw)?.pts).filter((p): p is number => p !== null && p !== undefined);
                        const best = Math.max(...allPtsThisGw);
                        const worst = Math.min(...allPtsThisGw);
                        return (
                          <div key={gw} className="w-10 shrink-0 flex justify-center">
                            <ScorePill pts={score?.pts ?? null} avg={avg} isBest={(score?.pts ?? -1) === best} isWorst={(score?.pts ?? 999) === worst} />
                          </div>
                        );
                      })}
                      <div className="w-16 text-right shrink-0">
                        <span className={`text-base font-black tabular-nums ${isFirst ? "text-orange-500" : "text-slate-800"}`}>{m.formTotal}</span>
                        <span className="text-xs text-slate-400 ml-0.5">pts</span>
                      </div>
                      <div className="w-20 text-right shrink-0 space-y-0.5">
                        <div className="flex items-center justify-end gap-1.5">
                          <span className="text-xs text-slate-400">#{m.overallRank}</span>
                          <TrendArrow delta={m.formVsOverall} />
                        </div>
                        {m.formVsOverall !== 0 && (
                          <p className="text-[9px] text-slate-400">{m.formVsOverall > 0 ? `+${m.formVsOverall} above` : `${m.formVsOverall} below`}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex sm:hidden items-start gap-3">
                      <span className={`text-sm font-black w-6 shrink-0 mt-0.5 ${isFirst ? "text-orange-500" : isLast ? "text-blue-400" : "text-slate-600"}`}>{m.formRank}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                          <span className="text-sm font-semibold text-slate-800">{m.displayName}</span>
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${badge.bg} ${badge.text}`}>{badge.label}</span>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          {data.formGws.map((gw) => {
                            const score = m.formGws.find((g) => g.gw === gw);
                            const avg = avgMap.get(gw) ?? 0;
                            const allPtsThisGw = data.managers.map((mg) => mg.formGws.find((g) => g.gw === gw)?.pts).filter((p): p is number => p !== null && p !== undefined);
                            return (
                              <div key={gw} className="flex flex-col items-center">
                                <span className="text-[9px] text-slate-400 mb-0.5">GW{gw}</span>
                                <ScorePill pts={score?.pts ?? null} avg={avg} isBest={(score?.pts ?? -1) === Math.max(...allPtsThisGw)} isWorst={(score?.pts ?? 999) === Math.min(...allPtsThisGw)} />
                              </div>
                            );
                          })}
                          <div className="ml-1 flex items-center gap-2">
                            <Sparkline scores={m.formGws} />
                            <div className="flex flex-col items-end">
                              <span className="text-base font-black text-slate-800 tabular-nums">{m.formTotal}<span className="text-xs font-normal text-slate-400 ml-0.5">pts</span></span>
                              <div className="flex items-center gap-1">
                                <span className="text-[10px] text-slate-400">#{m.overallRank}</span>
                                <TrendArrow delta={m.formVsOverall} />
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="px-5 py-2.5 border-t border-slate-100 bg-slate-50/40 flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-400">
              <span>Form rank based on GW{data.formGws[0]}–GW{data.formGws[data.formGws.length - 1]} only</span>
              <span>vs league = difference from overall standings position</span>
              <span className="ml-auto hidden sm:block"><span className="font-semibold text-emerald-600">↑</span> = higher form rank than league rank</span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-orange-50 border border-orange-200 rounded-xl overflow-hidden shadow-card">
              <div className="px-4 py-3 border-b border-orange-100 bg-orange-100/60">
                <h2 className="text-sm font-bold text-orange-800">In Form</h2>
                <p className="text-xs text-orange-600 mt-0.5">Scoring above league average in all {data.formWindow} GWs</p>
              </div>
              <div className="divide-y divide-orange-100/60">
                {data.managers.filter((m) => {
                  const avgs = data.formGws.map((gw) => avgMap.get(gw) ?? 0);
                  return m.formGws.every((g, i) => g.pts !== null && g.pts > avgs[i]);
                }).map((m) => (
                  <div key={m.managerId} className="px-4 py-2.5 flex items-center justify-between gap-3">
                    <span className="text-sm font-semibold text-slate-800">{m.displayName}</span>
                    <span className="text-sm font-black text-orange-500 tabular-nums">{m.formTotal}pts</span>
                  </div>
                ))}
                {data.managers.filter((m) => {
                  const avgs = data.formGws.map((gw) => avgMap.get(gw) ?? 0);
                  return m.formGws.every((g, i) => g.pts !== null && g.pts > avgs[i]);
                }).length === 0 && (
                  <p className="px-4 py-4 text-sm text-orange-400 text-center">No manager above average every GW</p>
                )}
              </div>
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded-xl overflow-hidden shadow-card">
              <div className="px-4 py-3 border-b border-blue-100 bg-blue-100/60">
                <h2 className="text-sm font-bold text-blue-800">Out of Form</h2>
                <p className="text-xs text-blue-600 mt-0.5">Scoring below league average in all {data.formWindow} GWs</p>
              </div>
              <div className="divide-y divide-blue-100/60">
                {data.managers.filter((m) => {
                  const avgs = data.formGws.map((gw) => avgMap.get(gw) ?? 0);
                  return m.formGws.every((g, i) => g.pts !== null && g.pts < avgs[i]);
                }).map((m) => (
                  <div key={m.managerId} className="px-4 py-2.5 flex items-center justify-between gap-3">
                    <span className="text-sm font-semibold text-slate-800">{m.displayName}</span>
                    <span className="text-sm font-black text-blue-500 tabular-nums">{m.formTotal}pts</span>
                  </div>
                ))}
                {data.managers.filter((m) => {
                  const avgs = data.formGws.map((gw) => avgMap.get(gw) ?? 0);
                  return m.formGws.every((g, i) => g.pts !== null && g.pts < avgs[i]);
                }).length === 0 && (
                  <p className="px-4 py-4 text-sm text-blue-400 text-center">No manager below average every GW</p>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {data && data.formGws.length === 0 && (
        <div className="bg-white border border-slate-200/80 rounded-xl px-5 py-10 text-center text-sm text-slate-400 shadow-card">
          No completed gameweeks yet — form table will appear once the first gameweek finishes.
        </div>
      )}
    </div>
  );
}
