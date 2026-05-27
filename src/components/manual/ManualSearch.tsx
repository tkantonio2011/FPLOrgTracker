"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ManualSearchResults } from "./ManualSearchResults";
import { searchManual, popularTopics } from "@/lib/manual/search";
import { useSearchShortcut } from "@/lib/manual/use-search-shortcut";
import { KeyboardShortcut } from "./KeyboardShortcut";
import type { ManualManifest } from "@/lib/manual/types";

interface ManualSearchProps {
  /** Currently unused; kept on the API to allow scoped search in future. */
  manifest?: ManualManifest;
}

const DEBOUNCE_MS = 150;

/**
 * Search input for the user manual.
 *
 * - Debounced free-text input → Fuse-powered ranked results.
 * - Up/Down arrows navigate; Enter opens the highlighted result; Esc closes.
 * - Cmd-K (Ctrl-K elsewhere) focuses the field from anywhere on the page.
 * - No-result fallback shows popular topics so the user is never stranded.
 */
export function ManualSearch(_props: ManualSearchProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [open, setOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  useSearchShortcut(inputRef);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [query]);

  const results = useMemo(() => searchManual(debounced), [debounced]);
  const fallback = useMemo(() => popularTopics(5), []);

  const displayCount = results.length > 0 ? results.length : fallback.length;

  useEffect(() => {
    // Reset highlight whenever the result set changes.
    setHighlightedIndex(0);
  }, [debounced]);

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex((i) => Math.min(i + 1, Math.max(0, displayCount - 1)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      const target = results.length > 0 ? results[highlightedIndex]?.entry : fallback[highlightedIndex];
      if (target) {
        e.preventDefault();
        router.push(target.path);
        setOpen(false);
        setQuery("");
        inputRef.current?.blur();
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    }
  }

  return (
    <div className="relative">
      <label htmlFor="manual-search" className="sr-only">
        Search the manual
      </label>
      <div className="relative">
        <input
          id="manual-search"
          ref={inputRef}
          type="search"
          role="combobox"
          aria-expanded={open}
          aria-controls="manual-search-results"
          placeholder="Search topics…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            // Delay so a result-row click registers before close.
            setTimeout(() => setOpen(false), 100);
          }}
          onKeyDown={onKeyDown}
          className="w-full px-3 py-1.5 pr-16 text-sm rounded border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-[#37003c] focus:border-transparent"
        />
        <span className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none">
          <KeyboardShortcut keys={["Cmd", "K"]} />
        </span>
      </div>
      {open && (
        <div id="manual-search-results">
          <ManualSearchResults
            query={debounced}
            results={results}
            popularFallback={fallback}
            highlightedIndex={highlightedIndex}
            onSelect={() => {
              setOpen(false);
              setQuery("");
            }}
          />
        </div>
      )}
    </div>
  );
}
