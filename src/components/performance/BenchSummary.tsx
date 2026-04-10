interface BenchSummaryProps {
  history: { gameweekId: number; pointsOnBench: number }[];
}

export function BenchSummary({ history }: BenchSummaryProps) {
  const totalBenchPoints = history.reduce((sum, h) => sum + h.pointsOnBench, 0);

  const top5Worst = [...history]
    .sort((a, b) => b.pointsOnBench - a.pointsOnBench)
    .slice(0, 5);

  return (
    <div className="bg-white border border-slate-200/80 rounded-xl p-5 space-y-4 shadow-card">
      <h3 className="text-sm font-semibold text-slate-700">Bench Points Wasted</h3>

      <div className="flex items-center gap-3">
        <div className="bg-orange-50 border border-orange-100 rounded-xl px-5 py-3 text-center">
          <p className="text-2xl font-bold text-orange-500 tabular">{totalBenchPoints}</p>
          <p className="text-xs text-slate-400 mt-0.5">pts left on bench</p>
        </div>
      </div>

      {top5Worst.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
            Worst Gameweeks
          </p>
          <ul className="space-y-1.5">
            {top5Worst.map((h) => (
              <li key={h.gameweekId} className="flex items-center justify-between text-sm">
                <span className="text-slate-500 tabular">GW {h.gameweekId}</span>
                <span
                  className={`font-semibold tabular ${
                    h.pointsOnBench > 12 ? "text-red-500" : "text-slate-700"
                  }`}
                >
                  {h.pointsOnBench} pts
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
