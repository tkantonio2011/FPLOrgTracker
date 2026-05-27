/**
 * Client-side fuzzy search over the manual's build-time JSON index.
 *
 * Fuse.js is configured with weighted keys (title > summary > body), a
 * permissive fuzzy threshold, and per-result match locations for inline
 * highlighting. The index is small enough (≤ ~30 topics × 5 kB) that
 * load time and search latency are both negligible.
 */

import Fuse from "fuse.js";
import type { FuseResult } from "fuse.js";
import searchIndexJson from "@/content/manual/search-index.json";
import type { SearchIndexEntry } from "./types";

const searchIndex = searchIndexJson as SearchIndexEntry[];

const fuse = new Fuse(searchIndex, {
  keys: [
    { name: "title", weight: 0.5 },
    { name: "summary", weight: 0.3 },
    { name: "body", weight: 0.2 },
  ],
  threshold: 0.4,
  ignoreLocation: true,
  minMatchCharLength: 2,
  includeMatches: true,
  includeScore: true,
});

export interface SearchResult {
  entry: SearchIndexEntry;
  score: number;
  matches: ReadonlyArray<{ key?: string; value?: string; indices: ReadonlyArray<[number, number]> }>;
}

/**
 * Returns ranked search results for `query`. Empty / under-min-length queries
 * return an empty list (callers should render the "popular topics" fallback).
 */
export function searchManual(query: string): SearchResult[] {
  const q = query.trim();
  if (q.length < 2) return [];
  const hits = fuse.search(q) as FuseResult<SearchIndexEntry>[];
  return hits.map((h) => ({
    entry: h.item,
    score: h.score ?? 1,
    matches: (h.matches ?? []).map((m) => ({
      key: m.key,
      value: m.value,
      indices: m.indices as ReadonlyArray<[number, number]>,
    })),
  }));
}

/**
 * Returns the first N topics from the index in their natural order. Used as
 * the fallback when a query returns nothing.
 */
export function popularTopics(n = 5): SearchIndexEntry[] {
  return searchIndex.slice(0, n);
}

/** Exposed for tests + the no-results fallback rendering. */
export function getSearchIndex(): ReadonlyArray<SearchIndexEntry> {
  return searchIndex;
}
