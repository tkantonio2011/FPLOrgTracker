# Quickstart: FPL Organisation Tracker

**Branch**: `001-fpl-org-tracker`
**Date**: 2026-04-02

---

## What This App Does

A web application for a group of colleagues who play Fantasy Premier League together. It lets members:
- Track the group's gameweek standings in one place
- Analyse their own season performance
- Get suggested transfers, captain picks, and chip timing recommendations

---

## Project Structure

```
fpl-org-tracker/         ← repository root
├── src/
│   ├── app/             ← Next.js App Router pages and layouts
│   │   ├── page.tsx                 → Redirect to /standings
│   │   ├── standings/page.tsx       → Gameweek leaderboard (P1)
│   │   ├── members/
│   │   │   └── [managerId]/
│   │   │       └── page.tsx         → Member performance page (P2)
│   │   ├── suggestions/
│   │   │   └── [managerId]/page.tsx → Transfers + Captain + Chips (P3/P4/P5)
│   │   ├── ownership/page.tsx       → Org-wide player ownership (P6)
│   │   └── admin/page.tsx           → Org setup: mini-league ID, members
│   │
│   ├── app/api/         ← Next.js Route Handlers (FPL proxy + aggregation)
│   │   ├── org/route.ts
│   │   ├── org/setup/route.ts
│   │   ├── org/sync/route.ts
│   │   ├── members/route.ts
│   │   ├── members/[managerId]/route.ts
│   │   ├── gameweeks/route.ts
│   │   ├── standings/route.ts
│   │   ├── members/[managerId]/performance/route.ts
│   │   ├── members/[managerId]/squad/route.ts
│   │   ├── players/route.ts
│   │   ├── fixtures/route.ts
│   │   ├── ownership/route.ts
│   │   ├── suggestions/transfers/route.ts
│   │   ├── suggestions/captain/route.ts
│   │   └── suggestions/chips/route.ts
│   │
│   ├── components/      ← Shared React components
│   │   ├── ui/          → Generic: Button, Card, Badge, Skeleton, Table
│   │   ├── layout/      → AppShell, Sidebar, Nav
│   │   ├── standings/   → LeaderboardTable, GwSelector, ScoreCard
│   │   ├── performance/ → PointsChart, PlayerContributionList, BenchSummary
│   │   ├── suggestions/ → TransferCard, CaptainCard, ChipAdvisorPanel
│   │   └── ownership/   → OwnershipTable, PlayerOwnershipDetail
│   │
│   ├── lib/             ← Shared logic
│   │   ├── fpl/
│   │   │   ├── client.ts       → FPL API fetch functions (server-side only)
│   │   │   └── types.ts        → TypeScript types for all FPL API shapes
│   │   ├── db/
│   │   │   └── index.ts        → Database client (SQLite via Prisma)
│   │   ├── suggestions/
│   │   │   ├── transfers.ts    → Transfer scoring algorithm
│   │   │   ├── captain.ts      → Captain scoring algorithm
│   │   │   └── chips.ts        → Chip timing logic (DGW/BGW detection)
│   │   └── cache.ts            → Caching helpers (next/cache wrappers)
│   │
│   └── prisma/
│       └── schema.prisma       → Organisation + Member schema (SQLite)
│
├── public/
├── package.json
├── next.config.ts
├── tailwind.config.ts
└── tsconfig.json
```

---

## Core Flows

### 1. First-Time Setup (Admin)
1. Admin navigates to `/admin`
2. Enters organisation name and FPL mini-league ID
3. App calls `POST /api/org/setup`, then `POST /api/org/sync`
4. Members are auto-populated from the mini-league standings
5. Admin can also add additional members via Manager ID

### 2. Gameweek Dashboard
1. Any member opens the app → lands on `/standings`
2. Frontend calls `GET /api/standings?gw=current`
3. Backend fetches from FPL league standings + bootstrap, aggregates, returns
4. Leaderboard displays with rank, GW score, total points, rank change
5. Member can select any previous GW from a dropdown to view historical standings

### 3. Personal Performance
1. Member clicks their name → `/members/{managerId}`
2. Frontend calls `GET /api/members/{managerId}/performance`
3. Points-over-time chart displayed; GW-by-GW table below
4. Member can select any GW to see their squad picks for that week

### 4. Suggestions
1. Member navigates to `/suggestions/{managerId}`
2. Three panels load in parallel:
   - `GET /api/suggestions/transfers` → ranked transfer cards
   - `GET /api/suggestions/captain` → ranked captain cards
   - `GET /api/suggestions/chips` → chip timing and org chip usage table

### 5. Ownership
1. Any member opens `/ownership`
2. `GET /api/ownership` returns all players owned by org members
3. Sortable table; filter by ownership count to find differentials

---

## Key Technical Notes

- **FPL API CORS**: Never call `fantasy.premierleague.com` from the browser. All FPL fetches go through `/api/*` Route Handlers.
- **Caching**: Use Next.js `fetch` with `next: { revalidate: N }` in `lib/fpl/client.ts`. Short TTL (60–120s) during live GWs, long TTL (3600s+) for static data.
- **Live gameweek detection**: Check `bootstrap-static/events` — the event where `is_current: true` and `finished: false` is a live GW. Adjust refetch intervals via TanStack Query accordingly.
- **Private teams**: If `entry/{managerId}/event/{gw}/picks/` returns a 404 or error, surface a message: "This member's team is set to private on FPL. Ask them to make their team public in their FPL settings."
- **Suggestion engine is stateless**: All suggestion computations happen in `lib/suggestions/` on each API call. No persistence required.
- **Database**: SQLite via Prisma for Organisation + Member records. Prisma migrations handle schema changes.

---

## Environment Variables

```
# .env.local
DATABASE_URL="file:./dev.db"
```

No external service API keys are required. The FPL API is public and unauthenticated.

---

## Getting Started (Development)

```bash
npm install
npx prisma migrate dev --name init
npm run dev
```

Open `http://localhost:3000/admin` to configure the organisation on first run.
