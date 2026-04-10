/**
 * Cache TTL helpers for Next.js route handlers.
 * Returns the appropriate revalidate seconds based on data type and gameweek state.
 */

export type CacheDataType =
  | "bootstrap"
  | "fixtures"
  | "live"
  | "standings"
  | "history"
  | "picks"
  | "player"
  | "suggestions"
  | "ownership";

/**
 * Returns the appropriate `revalidate` value (seconds) for a given data type.
 * Pass `isLiveGw: true` during an active gameweek to use shorter TTLs.
 */
export function getCacheTtl(
  dataType: CacheDataType,
  isLiveGw = false
): number {
  const ttls: Record<CacheDataType, { live: number; static: number }> = {
    bootstrap: { live: 300, static: 3600 },
    fixtures: { live: 3600, static: 86400 },
    live: { live: 60, static: 60 },
    standings: { live: 60, static: 3600 },
    history: { live: 3600, static: 3600 },
    picks: { live: 120, static: 86400 },
    player: { live: 3600, static: 3600 },
    suggestions: { live: 300, static: 300 },
    ownership: { live: 3600, static: 3600 },
  };

  const ttl = ttls[dataType];
  return isLiveGw ? ttl.live : ttl.static;
}

/**
 * Returns Cache-Control header value suitable for a Next.js route handler response.
 */
export function buildCacheHeader(revalidate: number): string {
  return `public, s-maxage=${revalidate}, stale-while-revalidate=${revalidate * 2}`;
}

/**
 * Determine if a gameweek is currently live based on bootstrap event data.
 * A gameweek is live when it is_current AND not finished.
 */
export function isCurrentGwLive(
  events: { id: number; is_current: boolean; finished: boolean }[],
  gw: number
): boolean {
  const event = events.find((e) => e.id === gw);
  if (!event) return false;
  return event.is_current && !event.finished;
}
