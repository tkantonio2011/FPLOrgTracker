import type { UseQueryResult } from "@tanstack/react-query";

interface Options {
  /**
   * If the cached data is older than this when a background refetch starts,
   * we hide it (showSkeleton) rather than risk the "old → flash → new"
   * misleading numbers update. Fresher cached data stays on screen with a
   * `RefreshingPill` instead.
   */
  staleAfterMs: number;
}

interface Gate {
  /** True on cold mount (no data) and on revisits where the cache is too old. */
  showSkeleton: boolean;
  /** True when a background refetch is in flight over recent-enough data. */
  showRefreshingPill: boolean;
}

export function useFreshnessGate<T>(
  query: Pick<UseQueryResult<T>, "isPending" | "isFetching" | "dataUpdatedAt">,
  { staleAfterMs }: Options,
): Gate {
  const { isPending, isFetching, dataUpdatedAt } = query;
  const ageMs = dataUpdatedAt ? Date.now() - dataUpdatedAt : Number.POSITIVE_INFINITY;
  const dataIsTooOld = ageMs > staleAfterMs;
  return {
    showSkeleton: isPending || (isFetching && dataIsTooOld),
    showRefreshingPill: isFetching && !isPending && !dataIsTooOld,
  };
}
