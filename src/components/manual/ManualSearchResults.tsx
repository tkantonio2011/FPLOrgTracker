"use client";

import Link from "next/link";
import { audienceBadge } from "@/lib/manual/audience";
import type { SearchResult } from "@/lib/manual/search";
import type { SearchIndexEntry } from "@/lib/manual/types";

interface ManualSearchResultsProps {
  query: string;
  results: SearchResult[];
  popularFallback: SearchIndexEntry[];
  highlightedIndex: number;
  onSelect: () => void;
}

/**
 * Result list rendered by `<ManualSearch>`. When the query maps to nothing
 * (or the user has typed too little), shows the popular-topics fallback so
 * the experience never bottoms out.
 */
export function ManualSearchResults({
  query,
  results,
  popularFallback,
  highlightedIndex,
  onSelect,
}: ManualSearchResultsProps) {
  const showFallback = results.length === 0;
  const items = showFallback
    ? popularFallback.map((entry) => ({ entry, isFallback: true }))
    : results.map((r) => ({ entry: r.entry, isFallback: false }));

  return (
    <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-card-md max-h-[60vh] overflow-y-auto z-30">
      {showFallback && query.trim().length >= 2 && (
        <div className="px-3 py-2 text-xs text-slate-500 border-b border-slate-100">
          No matches for &ldquo;{query}&rdquo; — try one of these popular topics:
        </div>
      )}
      {items.length === 0 ? (
        <div className="px-3 py-3 text-sm text-slate-500">No topics available.</div>
      ) : (
        <ul role="listbox" className="py-1">
          {items.map(({ entry }, i) => {
            const badge = audienceBadge(entry.audience);
            const isHighlighted = i === highlightedIndex;
            return (
              <li key={entry.path}>
                <Link
                  href={entry.path}
                  onClick={onSelect}
                  role="option"
                  aria-selected={isHighlighted}
                  className={`block px-3 py-2 text-sm transition-colors ${
                    isHighlighted ? "bg-[#37003c]/10" : "hover:bg-slate-50"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-medium text-slate-900">{entry.title}</span>
                    {badge && <span className={badge.className}>{badge.label}</span>}
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5 line-clamp-2">
                    {entry.summary}
                  </div>
                  <div className="text-[10px] text-slate-400 uppercase tracking-wider mt-1">
                    {entry.sectionTitle}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
