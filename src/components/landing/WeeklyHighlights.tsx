"use client";

import { useQuery } from "@tanstack/react-query";

interface Highlight {
  text: string;
  icon: string;
  type: "positive" | "negative" | "neutral" | "drama";
}

interface HighlightsData {
  highlights: Highlight[];
  currentGw: number;
}

const LEFT_BORDER: Record<string, string> = {
  positive: "border-l-emerald-400",
  negative: "border-l-red-400",
  neutral:  "border-l-slate-200",
  drama:    "border-l-violet-400",
};

export function WeeklyHighlights() {
  const { data, isLoading } = useQuery<HighlightsData>({
    queryKey: ["highlights"],
    queryFn: () => fetch("/api/highlights").then((r) => r.json()),
    staleTime: 300_000,
  });

  if (isLoading || !data || data.highlights.length === 0) return null;

  return (
    <div className="bg-white border border-slate-200/80 rounded-xl overflow-hidden shadow-card">
      {/* Header */}
      <div className="flex items-center gap-2.5 px-4 py-3 border-b border-slate-100 bg-slate-50/60">
        <span className="text-lg leading-none">🎬</span>
        <div>
          <h2 className="text-sm font-semibold text-slate-700">
            GW{data.currentGw} in Drama
          </h2>
          <p className="text-xs text-slate-400">The moments that mattered this week</p>
        </div>
      </div>

      {/* Highlight items */}
      <ul className="divide-y divide-slate-50">
        {data.highlights.map((h, i) => (
          <li
            key={i}
            className={`flex items-start gap-3 px-4 py-3 border-l-2 ${LEFT_BORDER[h.type]}`}
          >
            <span className="text-base leading-none mt-0.5 shrink-0 select-none">
              {h.icon}
            </span>
            <p className="text-sm text-slate-700 leading-snug">{h.text}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
