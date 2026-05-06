// FPL API client — server-side only. Never import this in client components.
import type {
  FplBootstrap,
  FplFixture,
  FplEntry,
  FplEntryHistory,
  FplEntryPicks,
  FplLeagueStandings,
  FplElementSummary,
  FplLiveEvent,
  FplTransfer,
} from "./types";

const FPL_BASE = "https://fantasy.premierleague.com/api";

const FPL_HEADERS = {
  "User-Agent": "Mozilla/5.0 (compatible; FPLOrgTracker/1.0; +https://github.com)",
};

async function fplFetch<T>(
  path: string,
  revalidate: number,
  tags?: string[]
): Promise<T> {
  const url = `${FPL_BASE}${path}`;
  const res = await fetch(url, {
    next: {
      revalidate,
      ...(tags ? { tags } : {}),
    },
    headers: FPL_HEADERS,
  });

  if (!res.ok) {
    throw new FplApiError(res.status, url);
  }

  return res.json() as Promise<T>;
}

// In-memory cache for responses that exceed Next.js's 2MB fetch cache limit.
interface CacheEntry<T> { data: T; expiresAt: number }
const memCache = new Map<string, CacheEntry<unknown>>();

async function fplFetchMem<T>(path: string, ttlSeconds: number): Promise<T> {
  const url = `${FPL_BASE}${path}`;
  const now = Date.now();
  const cached = memCache.get(url) as CacheEntry<T> | undefined;
  if (cached && cached.expiresAt > now) return cached.data;

  const res = await fetch(url, { cache: "no-store", headers: FPL_HEADERS });
  if (!res.ok) throw new FplApiError(res.status, url);

  const data = (await res.json()) as T;
  memCache.set(url, { data, expiresAt: now + ttlSeconds * 1000 });
  return data;
}

export class FplApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly url: string
  ) {
    super(`FPL API error ${status} fetching ${url}`);
    this.name = "FplApiError";
  }
}

// Cache TTLs (seconds)
const TTL = {
  BOOTSTRAP: 3600, // 1 hour — player prices/ownership update daily
  FIXTURES: 60, // 60 seconds — scores update during active gameweek
  LIVE: 60, // 60 seconds — live scoring
  HISTORY: 3600, // 1 hour during active GW
  PICKS_ACTIVE: 120, // 2 minutes for active GW picks
  PICKS_DONE: 86400, // 24 hours for completed GW picks
  STANDINGS: 60, // 1 minute during live GW
  PLAYER: 3600,
} as const;

/**
 * Fetch bootstrap-static — the master FPL data payload.
 * Contains all players, teams, gameweeks, and game settings.
 */
export async function fetchBootstrap(): Promise<FplBootstrap> {
  // bootstrap-static is ~2.6MB — exceeds Next.js 2MB fetch cache limit, use memory cache instead
  return fplFetchMem<FplBootstrap>("/bootstrap-static/", TTL.BOOTSTRAP);
}

/**
 * Fetch all fixtures, optionally filtered to a gameweek.
 */
export async function fetchFixtures(gw?: number): Promise<FplFixture[]> {
  const path = gw ? `/fixtures/?event=${gw}` : "/fixtures/";
  // fixtures payload can also be large — use memory cache
  return fplFetchMem<FplFixture[]>(path, TTL.FIXTURES);
}

/**
 * Fetch a manager's profile.
 */
export async function fetchEntry(managerId: number): Promise<FplEntry> {
  return fplFetch<FplEntry>(
    `/entry/${managerId}/`,
    TTL.HISTORY,
    [`entry-${managerId}`]
  );
}

/**
 * Fetch a manager's full season history and chip usage.
 */
export async function fetchEntryHistory(
  managerId: number
): Promise<FplEntryHistory> {
  return fplFetch<FplEntryHistory>(
    `/entry/${managerId}/history/`,
    TTL.HISTORY,
    [`entry-history-${managerId}`]
  );
}

/**
 * Fetch a manager's squad picks for a specific gameweek.
 * Throws FplApiError with status 404 if the team is private.
 */
export async function fetchEntryPicks(
  managerId: number,
  gw: number,
  isActiveGw = false
): Promise<FplEntryPicks> {
  return fplFetch<FplEntryPicks>(
    `/entry/${managerId}/event/${gw}/picks/`,
    isActiveGw ? TTL.PICKS_ACTIVE : TTL.PICKS_DONE,
    [`picks-${managerId}-${gw}`]
  );
}

/**
 * Fetch classic mini-league standings (paginated, 50 per page).
 */
export async function fetchLeagueStandings(
  leagueId: number,
  page = 1
): Promise<FplLeagueStandings> {
  return fplFetch<FplLeagueStandings>(
    `/leagues-classic/${leagueId}/standings/?page_standings=${page}`,
    TTL.STANDINGS,
    [`league-${leagueId}`]
  );
}

/**
 * Fetch all pages of league standings.
 */
export async function fetchAllLeagueStandings(
  leagueId: number
): Promise<FplLeagueStandings["standings"]["results"]> {
  const results: FplLeagueStandings["standings"]["results"] = [];
  let page = 1;
  let hasNext = true;

  while (hasNext) {
    const data = await fetchLeagueStandings(leagueId, page);
    results.push(...data.standings.results);
    hasNext = data.standings.has_next;
    page++;
  }

  return results;
}

/**
 * Fetch detailed player stats including fixture history and upcoming fixtures.
 */
export async function fetchElementSummary(
  playerId: number
): Promise<FplElementSummary> {
  return fplFetch<FplElementSummary>(
    `/element-summary/${playerId}/`,
    TTL.PLAYER,
    [`player-${playerId}`]
  );
}

/**
 * Fetch live scoring data for a gameweek (updates every ~60 seconds during matches).
 */
export async function fetchLiveGw(gw: number): Promise<FplLiveEvent> {
  return fplFetch<FplLiveEvent>(`/event/${gw}/live/`, TTL.LIVE, [
    `live-${gw}`,
  ]);
}

/**
 * Check if a gameweek is currently live (deadline passed, not all finished).
 */
export function isGameweekLive(
  events: FplBootstrap["events"],
  gw: number
): boolean {
  const event = events.find((e) => e.id === gw);
  if (!event) return false;
  return event.is_current && !event.finished;
}

/**
 * Get the current gameweek number.
 */
export function getCurrentGw(events: FplBootstrap["events"]): number {
  const current = events.find((e) => e.is_current);
  const next = events.find((e) => e.is_next);
  return current?.id ?? next?.id ?? 1;
}

/**
 * Fetch all transfers made by a manager across the season.
 */
export async function fetchEntryTransfers(managerId: number): Promise<FplTransfer[]> {
  return fplFetch<FplTransfer[]>(
    `/entry/${managerId}/transfers/`,
    TTL.HISTORY,
    [`transfers-${managerId}`]
  );
}
