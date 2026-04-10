# Implementation Plan: FPL Organisation Tracker

**Branch**: `001-fpl-org-tracker` | **Date**: 2026-04-02 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-fpl-org-tracker/spec.md`

---

## Summary

Build a React web application (Next.js full-stack) that allows an organisation's FPL mini-league members to track gameweek standings, analyse personal performance, and receive algorithmic suggestions for transfers, captain picks, and chip timing. Data is sourced from the unofficial FPL public API, proxied server-side to bypass CORS, and cached with short TTLs during live gameweeks. No external AI or prediction services are used; all suggestions are rules-based using FPL's own data fields (form, FDR, ICT index, injury status).

---

## Technical Context

**Language/Version**: TypeScript 5.x
**Primary Dependencies**: Next.js 14+ (App Router), TanStack Query v5, Tailwind CSS, Recharts, Prisma (SQLite)
**Storage**: SQLite (local file) via Prisma — for Organisation + Member records only; all other data from FPL API
**Testing**: Vitest + React Testing Library (component), Vitest (unit for suggestion algorithms)
**Target Platform**: Web browser (desktop-primary, mobile-responsive); deployed as a Node.js server or serverless (Vercel/self-hosted)
**Project Type**: Full-stack web application
**Performance Goals**: Standings visible within 5 seconds of page load; suggestions generated within 10 seconds
**Constraints**: FPL API CORS blocks browser-direct calls — all FPL requests must be server-side. FPL API has no official rate limit; cache aggressively to protect against throttling. Read-only — no FPL account mutations.
**Scale/Scope**: 2–50 organisation members; single FPL season; single mini-league per deployment

---

## Constitution Check

The project constitution is a placeholder template — no project-specific principles are ratified yet. No gates are violated. This plan may be revisited once a constitution is established.

**Status**: PASS (no violations, no constitution constraints to evaluate)

---

## Project Structure

### Documentation (this feature)

```text
specs/001-fpl-org-tracker/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── api-contracts.md # Phase 1 output
└── tasks.md             # Phase 2 output (/speckit.tasks command)
```

### Source Code (repository root)

```text
src/
├── app/                          # Next.js App Router
│   ├── page.tsx                  # Redirect → /standings
│   ├── standings/
│   │   └── page.tsx              # Gameweek leaderboard (P1)
│   ├── members/
│   │   └── [managerId]/
│   │       └── page.tsx          # Member performance (P2)
│   ├── suggestions/
│   │   └── [managerId]/
│   │       └── page.tsx          # Transfers / Captain / Chips (P3/P4/P5)
│   ├── ownership/
│   │   └── page.tsx              # Org player ownership (P6)
│   └── admin/
│       └── page.tsx              # Org setup + member management
│
├── app/api/                      # Next.js Route Handlers (FPL proxy)
│   ├── org/route.ts
│   ├── org/setup/route.ts
│   ├── org/sync/route.ts
│   ├── members/route.ts
│   ├── members/[managerId]/route.ts
│   ├── gameweeks/route.ts
│   ├── standings/route.ts
│   ├── members/[managerId]/performance/route.ts
│   ├── members/[managerId]/squad/route.ts
│   ├── players/route.ts
│   ├── fixtures/route.ts
│   ├── ownership/route.ts
│   ├── suggestions/transfers/route.ts
│   ├── suggestions/captain/route.ts
│   └── suggestions/chips/route.ts
│
├── components/                   # Shared React components
│   ├── ui/                       # Generic: Button, Card, Badge, Skeleton, Table
│   ├── layout/                   # AppShell, Sidebar, Nav
│   ├── standings/                # LeaderboardTable, GwSelector, ScoreCard
│   ├── performance/              # PointsChart, PlayerContributionList, BenchSummary
│   ├── suggestions/              # TransferCard, CaptainCard, ChipAdvisorPanel
│   └── ownership/                # OwnershipTable, PlayerOwnershipDetail
│
├── lib/                          # Shared business logic
│   ├── fpl/
│   │   ├── client.ts             # FPL API fetch functions (server-side only)
│   │   └── types.ts              # TypeScript types for all FPL API response shapes
│   ├── db/
│   │   └── index.ts              # Prisma client singleton
│   ├── suggestions/
│   │   ├── transfers.ts          # Transfer scoring algorithm
│   │   ├── captain.ts            # Captain scoring algorithm
│   │   └── chips.ts              # Chip timing logic + DGW/BGW detection
│   └── cache.ts                  # next/cache helpers with configurable TTLs
│
└── prisma/
    └── schema.prisma             # Organisation + Member schema (SQLite)

tests/
├── unit/
│   ├── suggestions/              # Algorithm unit tests
│   └── fpl/                      # FPL API response parsing tests
└── components/                   # React Testing Library component tests
```

**Structure Decision**: Single Next.js project (full-stack). Frontend and backend co-located in one repository. No separate service required — Next.js Route Handlers serve as the FPL API proxy and suggestion engine backend.

---

## Complexity Tracking

No constitution violations to justify. N/A.
