# Research: FPL Organisation Tracker

**Phase**: 0
**Branch**: `001-fpl-org-tracker`
**Date**: 2026-04-02

---

## Topic 1: FPL API

### Decision
Use the unofficial FPL REST API (`https://fantasy.premierleague.com/api/`) as the sole external data source. All calls must be made server-side to avoid CORS restrictions.

### Rationale
The FPL API is the authoritative source of all player, fixture, gameweek, and league data. It is widely used by the FPL community and provides all data required by the spec. No official API exists, but the unofficial endpoints are stable and extensively documented in the community.

### Key Endpoints

| Endpoint | Purpose |
|----------|---------|
| `GET /bootstrap-static/` | All players (elements), teams, gameweek events, element types. Single large payload — cache aggressively. |
| `GET /fixtures/` | Full season fixture list with difficulty ratings and home/away teams. |
| `GET /fixtures/?event={gw}` | Fixtures filtered to a single gameweek. |
| `GET /entry/{manager_id}/` | Manager profile: name, team name, overall rank, total points, chip usage. |
| `GET /entry/{manager_id}/history/` | Season history: per-gameweek points, overall rank, bank, value, chips used. |
| `GET /entry/{manager_id}/event/{gw}/picks/` | Squad picks for a specific gameweek: 15 players, starting XI, captain, vice-captain, active chip. |
| `GET /entry/{manager_id}/transfers/` | Full transfer history for the season. |
| `GET /leagues-classic/{league_id}/standings/?page_standings={n}` | Mini-league standings (paginated, 50 per page). Returns all members, their gameweek score, total points, and rank. |
| `GET /leagues-classic/{league_id}/standings/?phase={n}` | Standings filtered by phase (overall season = 1). |
| `GET /element-summary/{player_id}/` | Player fixture history (past gameweek points) and upcoming fixtures. |
| `GET /event/{gw}/live/` | Live scoring data during an active gameweek. Updates approximately every 2 minutes. Contains points breakdown per player (goals, assists, bonus, etc.). |
| `GET /dream-team/{gw}/` | Top-scoring 11 players for a completed gameweek. |

### CORS and Authentication
- **CORS**: The FPL API does **not** allow direct browser requests. All API calls must be made from a server-side context. Any client-side calls will fail with CORS errors.
- **Authentication**: Most endpoints are public and require no authentication. The `entry/{id}/picks/` endpoint is publicly accessible if the manager's team is not set to private in their FPL account settings.
- **Private teams**: If a manager has set their team to private, their picks will not be accessible. The app should surface a clear message asking them to make their team public.

### Rate Limiting
- No official rate limit is documented. Community experience indicates the API tolerates approximately 100 requests per minute per IP.
- Aggressive polling or fetching many managers in rapid succession risks temporary IP-level throttling.
- **Mitigation**: Implement server-side caching with appropriate TTLs (see below); batch requests where possible; avoid redundant fetches.

### Data Freshness
- `bootstrap-static`: Updated at the start of each gameweek. Cache for 1 hour minimum; revalidate on gameweek transitions.
- `fixtures`: Rarely changes; cache for 24 hours, revalidate when fixture updates are announced.
- `leagues-classic standings`: Updated every ~60 seconds during a live gameweek; every few hours outside of one.
- `event/{gw}/live/`: Updates every ~60–90 seconds during a live gameweek. Bonus points are provisional during match windows and finalised ~1–2 hours after the last match of the gameweek.
- `entry/{manager_id}/history/`: Updates once per gameweek on completion; cache for 1 hour during active GW, 24 hours otherwise.
- `entry/{manager_id}/event/{gw}/picks/`: Static once the gameweek deadline passes; cache indefinitely for completed GWs.

### Alternatives Considered
- **Third-party FPL data aggregators**: Rejected — adds external dependency and cost; raw FPL API is sufficient.
- **Official FPL API**: Does not exist. The unofficial API is the only option.

---

## Topic 2: Technology Stack

### Decision: Next.js (App Router) as the unified full-stack framework

**Rationale**: Next.js provides React for the frontend and Server Actions / Route Handlers for backend API routes in a single deployable unit. The API routes run server-side, bypassing FPL API CORS restrictions without needing a separate backend service. This minimises operational complexity for an internal tool with 2–50 users.

| Layer | Technology | Reason |
|-------|-----------|--------|
| Framework | Next.js 14+ (App Router) | Single project, server components, built-in API routes for FPL proxy |
| Language | TypeScript | Type safety for FPL API responses; catches shape mismatches early |
| Styling | Tailwind CSS | Rapid UI development; good for data-dense dashboards; no runtime overhead |
| Data fetching (client) | TanStack Query (React Query) v5 | Caching, background refetch, polling for live gameweek data |
| Charts/visualisation | Recharts | Lightweight, composable React chart library |
| State (UI) | React Context + `useState` | Sufficient for this scale; no Redux needed |
| Testing | Vitest + React Testing Library | Faster than Jest for Vite-compatible environments; RTL for component tests |
| Package manager | npm or pnpm | Standard; pnpm preferred for monorepo if needed later |

### Server-Side Caching in Next.js
- Use Next.js `unstable_cache` (or `fetch` with `next: { revalidate: N }`) in Route Handlers for FPL API responses.
- Cache TTLs:
  - `bootstrap-static`: `revalidate: 3600` (1 hour)
  - `fixtures`: `revalidate: 86400` (24 hours)
  - `event/{gw}/live/`: `revalidate: 120` (2 minutes) during active GW
  - `league standings`: `revalidate: 60` (1 minute) during active GW, `revalidate: 3600` otherwise
- Tag-based cache invalidation for manual purge capability.

### Alternatives Considered
- **Separate React + Express**: Rejected — two deployments to manage for an internal tool; adds ops overhead.
- **Remix**: Viable but Next.js has broader community FPL tooling and larger talent pool.
- **Create React App**: Deprecated; no server-side capability.

---

## Topic 3: TanStack Query (React Query) for Client Data Sync

### Decision: Use TanStack Query v5 for all client-side data fetching

**Rationale**: TanStack Query is the industry standard for server-state management in React. It eliminates manual loading/error state management, provides automatic background refetching, and allows polling during live gameweeks.

### Configuration
- **staleTime**:
  - Live gameweek data: `30_000` ms (30 seconds) — forces revalidation frequently
  - Historical data: `Infinity` — never stale once fetched
- **refetchInterval**:
  - Live gameweek: `60_000` ms (60 seconds) — matches FPL API update frequency (~60–90s)
  - Non-live: disabled
- **gcTime (cacheTime)**: `300_000` ms (5 minutes) — keep data in memory while navigating
- **retry**: 2 retries with exponential backoff for transient FPL API failures

### Query Key Strategy
```
['bootstrap']                          → all players/teams/events
['league', leagueId, 'standings', gw] → league standings per GW
['manager', managerId, 'history']      → season history
['manager', managerId, 'picks', gw]   → GW picks
['live', gw]                           → live scoring
['fixtures']                           → all fixtures
['player', playerId]                   → player summary
```

---

## Topic 4: Suggestion Algorithms

### Transfer Recommendations

**Decision**: Score-based ranking using FPL's own data fields (no external ML model required).

**Algorithm**:
1. For each player in the user's squad, calculate a "weakness score" based on:
   - **Injury/suspension flag**: immediate flagging regardless of score
   - **Fixture difficulty**: average FDR for the next 3 gameweeks (from `bootstrap-static` team fixtures)
   - **Form**: `form` field from `bootstrap-static/elements` (rolling 30-day average points)
   - **Expected minutes**: `minutes` field relative to team; flag if < 60% of available minutes played
2. Rank squad players by weakness score (highest = most urgent to replace)
3. For the top-N weak players, find replacement candidates in the same position by:
   - Sorting all available players (not already in squad) by a "value score": `total_points / now_cost` weighted by next-3-GW fixture difficulty adjustment
   - Filter to players affordable within the user's remaining budget
4. Present top 3 replacements per weak player with reasoning

**Key FPL data fields used**:
- `element.form` — recent form (rolling average)
- `element.ict_index` — Influence, Creativity, Threat composite index
- `element.status` — `a` (available), `d` (doubtful), `i` (injured), `s` (suspended), `u` (unavailable)
- `element.now_cost` — current price (divide by 10 for display)
- `element.total_points` — season total
- `element.minutes` — total minutes played
- `team.strength_overall_home` / `strength_overall_away` — for fixture difficulty calculations
- `fixture.difficulty` — pre-calculated FDR per team per fixture (1=easy, 5=hard)

### Captain Recommendations

**Decision**: Fixture-adjusted form score from squad players only.

**Algorithm**:
```
captain_score(player) =
  form_score(player) × fixture_bonus(player) × home_bonus(player) × minutes_reliability(player)

where:
  form_score       = player.form (FPL rolling 5-game average)
  fixture_bonus    = (5 - next_fixture.difficulty) / 4  → 0.25 to 1.0 scale
  home_bonus       = 1.15 if home else 0.90  (home players score ~15–20% more FPL points)
  minutes_reliability = starts / games_played  → 0.0 to 1.0 (from bootstrap-static)
```
- If a player has a DGW: multiply score by 1.8 (double the opportunity, partial discount for uncertainty)
- Flag injury/doubtful status even for high-scoring recommendations
- "Differential" filter: surface squad players with low ownership in the organisation (owned by ≤ 1 other member)

### Chip Timing Recommendations

**Algorithm per chip**:

| Chip | Trigger Condition |
|------|------------------|
| **Bench Boost** | Find the gameweek where the sum of the bench 4 players' expected points (based on form × fixture_bonus) is highest. Prioritise GWs where ≥ 2 bench players have DGW fixtures. |
| **Triple Captain** | Find the GW where the best captain candidate has a DGW or a very easy fixture (FDR ≤ 2). Multiply captain_score by 3 vs 2 to show expected uplift. |
| **Wildcard** | Trigger recommendation when: (a) the member is in the bottom half of the organisation for 3+ consecutive GWs, OR (b) ≥ 3 squad players are injured/suspended, OR (c) the member's squad has ≥ 4 players with hard fixtures (FDR 4-5) for the next 3 GWs. |
| **Free Hit** | Recommend for confirmed Blank Gameweek (BGW) affecting ≥ 4 of the member's players. BGW detected when `fixture.event` is null for teams in the squad. |

**DGW/BGW Detection**: Scan `fixtures` data; a team has a DGW in GW N if they appear in 2 fixture records with `event == N`. A BGW is when a team has 0 fixture records with `event == N`.

### Known FPL npm Wrappers (considered)

| Package | Notes |
|---------|-------|
| `fpl-api` | Lightweight promise-based wrapper for public endpoints |
| `fpl-api-node` | Older wrapper, less maintained |
| `fantasy-premier-league` | TypeScript-typed wrapper |
| `@bearbobs/fpl` | More recent, TypeScript support |

**Decision**: Write thin fetch wrappers directly in `lib/fpl/client.ts` rather than using a third-party package. This gives full control over Next.js `fetch` cache options (`next: { revalidate: N }`) which wrappers typically don't expose cleanly.

### Alternatives Considered
- **ML/AI model for predictions**: Rejected for v1 — adds complexity, requires training data, overkill for an internal tool. Rules-based approach is transparent and explainable to users.
- **Third-party FPL prediction APIs (e.g., FPLReview, Opta)**: Rejected — cost, external dependency, API changes outside our control.
