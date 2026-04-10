# Tasks: FPL Organisation Tracker

**Input**: Design documents from `/specs/001-fpl-org-tracker/`
**Prerequisites**: plan.md ✓ spec.md ✓ research.md ✓ data-model.md ✓ contracts/ ✓ quickstart.md ✓

**Tests**: Not requested in spec — no test tasks generated.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1–US6)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization, tooling, and directory structure

- [x] T00- [x] T001 Initialize Next.js 14 TypeScript project with App Router in repository root (`npx create-next-app@latest . --typescript --app --tailwind --src-dir --import-alias "@/*"`)
- [x] T00- [x] T002 [P] Install and configure additional dependencies: TanStack Query v5, Recharts, Prisma, and `@prisma/client` in `package.json`
- [x] T00- [x] T003 [P] Configure Vitest and React Testing Library: add `vitest.config.ts` and `src/test/setup.ts` at repository root
- [x] T00- [x] T004 [P] Create full project directory structure per plan: `src/components/ui/`, `src/components/layout/`, `src/components/standings/`, `src/components/performance/`, `src/components/suggestions/`, `src/components/ownership/`, `src/lib/fpl/`, `src/lib/db/`, `src/lib/suggestions/`, `tests/unit/suggestions/`, `tests/components/`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that ALL user stories depend on — FPL API client, database, caching, shared UI, and admin setup

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T00- [x] T005 Define all FPL API TypeScript types (elements, teams, events, fixtures, picks, entry, league standings, live event) in `src/lib/fpl/types.ts` — reference `data-model.md` entity fields and `contracts/api-contracts.md` for shapes
- [x] T00- [x] T006 [P] Implement FPL API client functions (server-side only) in `src/lib/fpl/client.ts`: `fetchBootstrap()`, `fetchFixtures(gw?)`, `fetchEntry(managerId)`, `fetchEntryHistory(managerId)`, `fetchEntryPicks(managerId, gw)`, `fetchLeagueStandings(leagueId, page)`, `fetchElementSummary(playerId)`, `fetchLiveGw(gw)` — each using `fetch()` with `next: { revalidate: N }` TTLs per `research.md`
- [x] T00- [x] T007 [P] Define Prisma schema for `Organisation` and `Member` entities in `prisma/schema.prisma` — field definitions per `data-model.md`; SQLite datasource; generate Prisma client
- [x] T00- [x] T008 Run `npx prisma migrate dev --name init` to create SQLite database and apply schema from `prisma/schema.prisma`
- [x] T00- [x] T009 [P] Implement Prisma client singleton in `src/lib/db/index.ts` with global instance guard for development hot-reload
- [x] T0- [x] T010 [P] Implement caching helpers in `src/lib/cache.ts`: `getCacheTtl(dataType, isLiveGw)` returning appropriate `revalidate` seconds per `research.md` TTL table; `isGameweekLive(bootstrap)` helper using `is_current` and fixture data
- [x] T0- [x] T011 [P] Build shared UI primitive components in `src/components/ui/`: `Button.tsx`, `Card.tsx`, `Badge.tsx` (with status colour variants for injury flags: green/yellow/red/grey), `Skeleton.tsx` (loading placeholder), `Table.tsx` (sortable, filterable)
- [x] T0- [x] T012 [P] Build app layout shell in `src/components/layout/`: `AppShell.tsx` (page wrapper with sidebar), `Sidebar.tsx` (nav links: Dashboard, My Performance, Suggestions, Ownership, Admin), `Nav.tsx` (top bar with org name and current GW indicator)
- [x] T0- [x] T013 Implement organisation and member API route handlers (all must be complete before admin page and US1): `GET /api/org` in `src/app/api/org/route.ts`, `POST /api/org/setup` in `src/app/api/org/setup/route.ts`, `POST /api/org/sync` in `src/app/api/org/sync/route.ts`, `POST /api/members` and `GET /api/members` in `src/app/api/members/route.ts`, `DELETE /api/members/[managerId]` in `src/app/api/members/[managerId]/route.ts` — responses per `contracts/api-contracts.md`
- [x] T0- [x] T014 Implement `GET /api/gameweeks` route handler in `src/app/api/gameweeks/route.ts`: fetch bootstrap, extract events array, identify current/next/finished GWs, return per contract shape; `revalidate: 3600`
- [x] T0- [x] T015 Build admin page in `src/app/admin/page.tsx`: org name input, mini-league ID input, "Save & Sync" button calling `POST /api/org/setup` then `POST /api/org/sync`; member list table with manual-add form (Manager ID input) calling `POST /api/members`; remove button per member calling `DELETE /api/members/[managerId]`; display sync status and member count
- [x] T0- [x] T016 Set up TanStack Query provider and configure `QueryClient` with default options (staleTime, gcTime, retry) in `src/app/layout.tsx`; wrap app in `<QueryClientProvider>`; add `AppShell` wrapper; configure root `src/app/page.tsx` to redirect to `/standings` (or `/admin` if org not configured)

**Checkpoint**: Foundation complete — admin can configure the org and all user story phases can now begin

---

## Phase 3: User Story 1 — Gameweek Progress Dashboard (Priority: P1) 🎯 MVP

**Goal**: All organisation members can see the current gameweek leaderboard and navigate historical GW standings

**Independent Test**: Configure org with mini-league ID via `/admin`, open `/standings`, verify ranked list of all members with GW score, total points, rank change, and points-behind-leader. Select a past GW and verify standings update correctly.

- [x] T0- [x] T017 [US1] Implement `GET /api/standings` route handler in `src/app/api/standings/route.ts`: accept `?gw=` param (default current GW); fetch league standings from FPL, merge with local member display names, compute org average GW points, compute global FPL average from bootstrap; return per `contracts/api-contracts.md` standings shape; `revalidate: 60` during live GW, `revalidate: 3600` otherwise
- [x] T0- [x] T018 [P] [US1] Build `GwSelector` component in `src/components/standings/GwSelector.tsx`: dropdown populated from `GET /api/gameweeks`; emits selected GW number; highlights current GW; disabled state for future GWs
- [x] T0- [x] T019 [P] [US1] Build `ScoreCard` component in `src/components/standings/ScoreCard.tsx`: displays a single member's GW points, total points, overall rank, rank change arrow (up/down/neutral), points behind leader, and chip badge if a chip was played this GW
- [x] T0- [x] T020 [US1] Build `LeaderboardTable` component in `src/components/standings/LeaderboardTable.tsx`: ranked list of `ScoreCard` rows; org average row at bottom; global FPL average row; clickable member rows navigating to `/members/[managerId]`; depends on T018, T019
- [x] T0- [x] T021 [US1] Build standings page in `src/app/standings/page.tsx`: fetch standings via TanStack Query (`queryKey: ['standings', gw]`); compose `GwSelector` + `LeaderboardTable`; activate `refetchInterval: 60_000` when `isGameweekLive` is true; show `Skeleton` while loading; depends on T017, T020

**Checkpoint**: User Story 1 fully functional — open `/standings` and see the live org leaderboard

---

## Phase 4: User Story 2 — Personal Team Performance Analysis (Priority: P2)

**Goal**: Any member can view their own season-long performance, player contributions, and comparisons against org and global averages

**Independent Test**: Click a member's name from the leaderboard, verify GW-by-GW points chart renders with all completed GWs, squad picks are shown for any selected GW, bench points wasted are visible, and org/global average lines appear on the chart.

- [x] T0- [x] T022 [P] [US2] Implement `GET /api/members/[managerId]/performance` route handler in `src/app/api/members/[managerId]/performance/route.ts`: fetch `entry/{managerId}/history/`, enrich with org and global averages per GW from bootstrap events, compute season summary (best/worst GW, total bench points, total transfer cost); return per contract shape; `revalidate: 3600`
- [x] T0- [x] T023 [P] [US2] Implement `GET /api/members/[managerId]/squad` route handler in `src/app/api/members/[managerId]/squad/route.ts`: accept `?gw=` param; fetch `entry/{managerId}/event/{gw}/picks/`, enrich each pick with player name, team, element type, points (from live or history), status, and news; handle private team 403 with `MANAGER_PRIVATE` error code; `revalidate: 3600` for completed GWs, `revalidate: 120` for active GW
- [x] T0- [x] T024 [P] [US2] Build `PointsChart` component in `src/components/performance/PointsChart.tsx`: Recharts `LineChart` with three lines (member points, org average, global average) over all GWs; tooltip showing exact scores; highlight best and worst GW data points; chip badges on GW axis where chips were played
- [x] T0- [x] T025 [P] [US2] Build `BenchSummary` component in `src/components/performance/BenchSummary.tsx`: shows total bench points wasted for the season and per-GW bench points; highlights GWs with >12 bench points left unused
- [x] T0- [x] T026 [US2] Build `PlayerContributionList` component in `src/components/performance/PlayerContributionList.tsx`: list of all 15 players in the selected GW squad; columns: position, player name, team, points scored, starting/bench indicator, captain/vice-captain badge, injury status badge; depends on T023
- [x] T0- [x] T027 [US2] Build member performance page in `src/app/members/[managerId]/page.tsx`: fetch performance and squad data via TanStack Query; compose `PointsChart` + `BenchSummary` + GW selector + `PlayerContributionList`; handle `MANAGER_PRIVATE` error with guidance message; depends on T022, T023, T024, T025, T026

**Checkpoint**: User Story 2 fully functional — member performance page shows full season history and per-GW squad detail

---

## Phase 5: User Story 3 — Transfer and Substitution Suggestions (Priority: P3)

**Goal**: Members can see ranked transfer recommendations with reasoning before each gameweek deadline

**Independent Test**: Navigate to `/suggestions/[managerId]`, verify at least 3 ranked transfer cards are shown for the next GW, each with a player-out, player-in, reasoning, FDR indication, and free-transfer/cost flag.

- [x] T0- [x] T028 [P] [US3] Implement `GET /api/players` route handler in `src/app/api/players/route.ts`: fetch bootstrap elements; support query params `?position=`, `?minForm=`, `?maxCost=`, `?status=`; enrich each player with upcoming 3 GW fixtures and difficulty ratings from fixtures data; return per contract shape; `revalidate: 3600`
- [x] T0- [x] T029 [P] [US3] Implement `GET /api/fixtures` route handler in `src/app/api/fixtures/route.ts`: fetch all fixtures; accept `?gw=` filter; annotate each fixture with DGW flag per team (team appears twice in same event); return per contract shape; `revalidate: 86400`
- [x] T0- [x] T030 [US3] Implement transfer scoring algorithm in `src/lib/suggestions/transfers.ts`: for each squad player compute weakness score (injury flag, avg FDR next 3 GWs weighted, form, minutes reliability); for top-3 weakest find replacement candidates (same position, within budget, not in squad) ranked by composite score (form × fixture_ease × ICT × PPM); return ranked `Suggestion[]` with `reasoning` string; depends on T028, T029
- [x] T0- [x] T031 [US3] Implement `GET /api/suggestions/transfers` route handler in `src/app/api/suggestions/transfers/route.ts`: accept `?managerId=` and `?gw=`; fetch member picks and budget from entry; load players and fixtures; call `transfers.ts` algorithm; return per contract shape; `revalidate: 300`; depends on T030
- [x] T0- [x] T032 [US3] Build `TransferCard` component in `src/components/suggestions/TransferCard.tsx`: displays player-out (with injury badge if applicable), player-in (with form, upcoming FDR pip indicators), free-transfer vs cost badge, reasoning text, rank indicator
- [x] T0- [x] T033 [US3] Build suggestions page transfers panel in `src/app/suggestions/[managerId]/page.tsx`: fetch transfer suggestions via TanStack Query; render ranked list of `TransferCard` components; show skeleton while loading; display "Deadline passed" message if GW deadline has passed; depends on T031, T032

**Checkpoint**: User Story 3 fully functional — transfer suggestions panel renders with ranked recommendations

---

## Phase 6: User Story 4 — Captain Recommendation (Priority: P4)

**Goal**: Members see a ranked captain shortlist from their own squad with clear rationale before each deadline

**Independent Test**: On the suggestions page, verify a captain recommendations section appears with ≥3 ranked players from the member's current squad, each showing form, fixture, home/away, differential flag, and plain-English reasoning.

- [x] T0- [x] T034 [US4] Implement captain scoring algorithm in `src/lib/suggestions/captain.ts`: filter to member's starting XI; score each player: `form × ((5 - fdr) / 4) × home_multiplier × minutes_reliability`; double score for DGW players; flag injury/doubtful players; flag differentials (owned by ≤1 other org member, requires `GET /api/ownership`); return ranked `Suggestion[]` with `reasoning` and `isDifferential`
- [x] T0- [x] T035 [US4] Implement `GET /api/suggestions/captain` route handler in `src/app/api/suggestions/captain/route.ts`: accept `?managerId=` and `?gw=`; fetch member picks, fixtures, bootstrap; call `captain.ts` algorithm; return per contract shape; `revalidate: 300`; depends on T034
- [x] T0- [x] T036 [US4] Build `CaptainCard` component in `src/components/suggestions/CaptainCard.tsx`: displays player name, team, next fixture (opponent + home/away + FDR pip), form value, DGW badge if applicable, differential badge if isDifferential, injury warning if flagged, reasoning text, rank number
- [x] T0- [x] T037 [US4] Add captain suggestions panel to `src/app/suggestions/[managerId]/page.tsx`: add second section below transfers; fetch captain suggestions via TanStack Query; render ranked list of `CaptainCard` components; add "Differential" filter toggle; depends on T035, T036

**Checkpoint**: User Story 4 fully functional — captain panel appears on suggestions page alongside transfer panel

---

## Phase 7: User Story 5 — Game Chip Advisor (Priority: P5)

**Goal**: Members receive chip timing recommendations and can see chip usage across the whole organisation

**Independent Test**: On the suggestions page, verify a chip advisor section shows each of the member's remaining chips with a recommended GW and reasoning, and the org chip usage table lists all members with their chip statuses.

- [x] T0- [x] T038 [US5] Implement chip timing and DGW/BGW detection logic in `src/lib/suggestions/chips.ts`: `detectDgw(fixtures, gw)` returns teams with double fixtures; `detectBgw(fixtures, gw)` returns teams with no fixture; `scoreBenchBoost(squad, fixtures)` finds GW with highest expected bench points across DGW GWs; `scoreTripleCaptain(squad, fixtures)` finds best captain candidate in DGW; `scoreWildcard(history, squad, fixtures)` triggers on form decay / injury count / hard fixtures; `scoreFreeHit(squad, fixtures)` triggers on BGW affecting ≥4 squad players; return chip recommendations per member
- [x] T0- [x] T039 [US5] Implement `GET /api/suggestions/chips` route handler in `src/app/api/suggestions/chips/route.ts`: accept `?managerId=`; fetch member history (chip usage), all members' chip usage, squad, fixtures, bootstrap; call `chips.ts` algorithms; build org chip usage table; return per contract shape; `revalidate: 3600`; depends on T038
- [x] T0- [x] T040 [US5] Build `ChipAdvisorPanel` component in `src/components/suggestions/ChipAdvisorPanel.tsx`: four chip cards (Bench Boost, Triple Captain, Wildcard, Free Hit) each showing: chip name, available/used badge, recommended GW (if available), expected uplift metric, reasoning text; below chips: org chip usage table (all members × 4 chips, checkmark/cross per cell)
- [x] T0- [x] T041 [US5] Add chip advisor panel to `src/app/suggestions/[managerId]/page.tsx`: add third section below captain panel; fetch chip suggestions via TanStack Query; render `ChipAdvisorPanel`; depends on T039, T040

**Checkpoint**: User Story 5 fully functional — suggestions page has all three panels: transfers, captain, and chip advisor

---

## Phase 8: User Story 6 — Organisation Player Ownership (Priority: P6)

**Goal**: Members can browse which players are owned across the organisation, spot differentials, and drill into player ownership details

**Independent Test**: Navigate to `/ownership`, verify a table lists all players owned by at least one org member sorted by ownership count, showing owner names, total points contributed, and captain count. Filter to "low ownership" and verify only players owned by ≤2 members appear.

- [x] T0- [x] T042 [US6] Implement `GET /api/ownership` route handler in `src/app/api/ownership/route.ts`: accept `?gw=`; fetch all members' picks for the GW; aggregate by player — owner count, owner display names, captain count, total points contributed by that player across owners, starting vs bench breakdown; enrich with player details from bootstrap; return per contract shape; `revalidate: 3600`; depends on T013 (members API)
- [x] T0- [x] T043 [P] [US6] Build `OwnershipTable` component in `src/components/ownership/OwnershipTable.tsx`: sortable table columns: player name, position, team, org ownership count, org ownership %, owner names (abbreviated), total points contributed, captain count; filter controls: position filter, min/max ownership count slider (for differential filtering); click row to open `PlayerOwnershipDetail`
- [x] T0- [x] T044 [P] [US6] Build `PlayerOwnershipDetail` component in `src/components/ownership/PlayerOwnershipDetail.tsx`: slide-in panel or modal; shows player's GW-by-GW points history; list of which org members own them, whether starting or bench for each owner; player form, ICT index, upcoming fixtures table
- [x] T0- [x] T045 [US6] Build ownership page in `src/app/ownership/page.tsx`: fetch ownership data via TanStack Query (`queryKey: ['ownership', gw]`); GW selector at top; compose `OwnershipTable` + `PlayerOwnershipDetail` panel; show total members count and total unique players owned; depends on T042, T043, T044

**Checkpoint**: User Story 6 fully functional — ownership page renders with full org player breakdown and differential filter

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect all user stories and production readiness

- [x] T0- [x] T046 [P] Add global error boundary component in `src/components/ui/ErrorBoundary.tsx` and wrap each page with it; handle `FPL_API_UNAVAILABLE` error code with a user-friendly "FPL data temporarily unavailable" banner; handle `ORG_NOT_CONFIGURED` by redirecting to `/admin`
- [x] T0- [x] T047 [P] Add private team error state display across squad-dependent pages: detect `MANAGER_PRIVATE` error in `PlayerContributionList`, transfers, and captain pages; show dismissible info banner "This member's team is private on FPL — ask them to make it public in their FPL account settings"
- [x] T0- [x] T048 [P] Add injury and suspension status badges consistently across all player-displaying components: `ScoreCard`, `PlayerContributionList`, `TransferCard`, `CaptainCard`, `OwnershipTable`; use FPL `element.status` and `element.news` fields; colour-code per `Badge` component variants
- [x] T0- [x] T049 Implement adaptive live GW polling in `src/app/layout.tsx`: fetch bootstrap on mount; expose `isGameweekLive` via React Context; TanStack Query `refetchInterval` in standings and suggestions pages reads from context — 60s when live, `false` when not; update `isGameweekLive` every 5 minutes
- [x] T0- [x] T050 [P] Add loading skeleton states to all pages: `standings/page.tsx` (leaderboard skeleton), `members/[managerId]/page.tsx` (chart skeleton + list skeleton), `suggestions/[managerId]/page.tsx` (card skeletons), `ownership/page.tsx` (table skeleton) using `Skeleton` component from `src/components/ui/Skeleton.tsx`
- [x] T0- [x] T051 [P] Add mobile responsiveness to all pages: verify `LeaderboardTable` collapses to compact card view on small screens; `PointsChart` scales responsively; suggestion cards stack vertically; `OwnershipTable` horizontally scrollable with sticky first column
- [x] T0- [x] T052 [P] Add navigation breadcrumbs and inter-page links: "← Back to standings" link on member performance page; member name links in ownership detail leading to performance page; nav highlighting active route in `Sidebar.tsx`
- [x] T0- [x] T053 Validate full user journey against `quickstart.md`: configure org via `/admin`; verify standings load; click member; verify performance page; open suggestions; verify all three panels (transfers, captain, chips); open ownership; verify table and filter

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 completion — **BLOCKS all user stories**
- **User Stories (Phases 3–8)**: All depend on Foundational phase (Phase 2)
  - Can proceed in priority order (P1→P2→P3...) or in parallel with multiple developers
- **Polish (Phase 9)**: Depends on all desired user stories complete

### User Story Dependencies

- **US1 (P1) — Standings**: Depends only on Foundational. No US dependencies.
- **US2 (P2) — Performance**: Depends only on Foundational. Benefits from US1 navigation but independently testable.
- **US3 (P3) — Transfers**: Depends only on Foundational. Shares suggestions page with US4/US5 but independently testable.
- **US4 (P4) — Captain**: Depends on Foundational. Extends suggestions page built in US3 (adds a second panel). Can be tested independently.
- **US5 (P5) — Chips**: Depends on Foundational. Extends suggestions page built in US3/US4 (adds third panel). Can be tested independently.
- **US6 (P6) — Ownership**: Depends on Foundational (members API from T013). No US dependencies.

### Within Each User Story

- Route handler MUST be implemented before the page component
- Algorithm/lib MUST be implemented before the route handler (US3/US4/US5)
- Shared components (marked [P]) can be built in parallel with the route handler

---

## Parallel Opportunities

### Phase 2 (Foundational) — can run in parallel after T001–T004:

```
T005 → T006 (parallel) [FPL types → FPL client]
T007 → T008 (sequential) [Prisma schema → migrate]
T009 (parallel after T008) [Prisma singleton]
T010 (parallel) [cache helpers]
T011 (parallel) [UI primitives]
T012 (parallel) [layout shell]
T013 → T014 → T015 → T016 (sequential)
```

### Phase 3 (US1) — parallel opportunities:
```
T018 GwSelector ─┐
T019 ScoreCard  ─┼─ (all parallel) → T020 LeaderboardTable → T021 standings page
T017 Route      ─┘
```

### Phase 4 (US2) — parallel opportunities:
```
T022 performance route  ─┐
T023 squad route        ─┤
T024 PointsChart        ─┼─ (all parallel) → T026 PlayerContributionList → T027 page
T025 BenchSummary       ─┘
```

### Phase 8 (US6) — parallel opportunities:
```
T043 OwnershipTable       ─┐
T044 PlayerOwnershipDetail ─┼─ (parallel) → T045 page
T042 ownership route      ─┘
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (**CRITICAL** — blocks all stories)
3. Complete Phase 3: User Story 1 (Gameweek Dashboard)
4. **STOP and VALIDATE**: Open `/standings`, verify org leaderboard loads with live data
5. Demo to org members — this alone delivers immediate value

### Incremental Delivery

1. Phase 1 + Phase 2 → Foundation ready (admin can configure org)
2. + Phase 3 (US1) → **MVP: Gameweek leaderboard live**
3. + Phase 4 (US2) → Members can drill into personal performance
4. + Phase 5 (US3) → Transfer suggestions available
5. + Phase 6 (US4) → Captain suggestions added to suggestions page
6. + Phase 7 (US5) → Chip advisor added to suggestions page
7. + Phase 8 (US6) → Full player ownership view
8. + Phase 9 → Polish, mobile, error handling

### Parallel Team Strategy

With 2+ developers after Foundational is complete:
- **Dev A**: US1 (standings) → US2 (performance)
- **Dev B**: US3 (transfers) → US4 (captain) → US5 (chips)
- **Dev C**: US6 (ownership) → Phase 9 polish

---

## Notes

- [P] tasks operate on different files — no risk of conflicts
- Route handlers in `src/app/api/` must never import from client-side components
- `src/lib/fpl/client.ts` is server-only — mark with `'use server'` or ensure it is never imported client-side
- All FPL `now_cost` values are integers (tenths of £) — divide by 10 only at the display layer
- `isGameweekLive` detection is the key cross-cutting concern — get it right in T049 to avoid over-polling
- Commit after each task or logical group; each phase checkpoint is a natural commit boundary
- Stop at any checkpoint to demo or deploy independently
