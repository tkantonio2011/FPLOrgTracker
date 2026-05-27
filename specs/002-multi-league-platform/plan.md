# Implementation Plan: Multi-League Admin UX

**Branch**: `002-multi-league-platform` | **Date**: 2026-05-13 | **Spec**: [./spec.md](./spec.md)
**Input**: Feature specification from `D:\Development\EnergyOne\FPLOrgTracker\specs\002-multi-league-platform\spec.md`
**Scope addition**: "A League Admin who holds the admin role on more than one league SHOULD be able to manage all of those leagues without UX friction."

> This is a **focused UX delta** on top of the already-shipped multi-league platform (T001–T100 complete). The data model and per-league admin pages already cover this case functionally (`LeagueMembership.role` is per-league; FR-014 explicitly permits multi-league admins). What's missing is the *navigation surface* for an admin who lives across two or more leagues. No schema changes. No new business logic. Only new pages and a context-preserving switcher.

## Summary

A user who holds `role: 'admin'` on N ≥ 2 active `LeagueMembership` rows currently can manage each league only by first navigating into that league (via `/leagues` chooser or LeagueSwitcher) and then drilling into the admin sub-shell. This forces an extra hop per league switch and the LeagueSwitcher drops the user back at `/standings` even when they were managing the league they came from. The fix:

1. **`/my-admin`** — a server-rendered "admin home" listing every league the current user administers, with deep links to `/l/{slug}/admin/{settings,members,digest,audit}`.
2. **Context-preserving LeagueSwitcher** — when the current path is `/l/A/admin/<sub>`, switching to League B routes to `/l/B/admin/<sub>` if the user admins B, falling back to `/l/B/standings` otherwise.
3. **Grouped `/leagues` chooser** — render "Leagues you administer" above "Leagues you're a member of" when both groups are non-empty.
4. **Sidebar surface** — when the user admins 2+ leagues, show a single "My admin leagues" entry near the top of the sidebar that links to `/my-admin`.

All four changes are read-only against existing tables; the `memberships[]` array on `GET /api/auth/me` is already sufficient.

## Technical Context

**Language/Version**: TypeScript 5.x (existing codebase)
**Primary Dependencies**: Next.js 14 (App Router), TanStack Query v5, Prisma 5 (SQLite), Tailwind CSS, Zod — all already installed.
**Storage**: SQLite via Prisma — **no schema changes**.
**Testing**: Vitest (integration via `test:integration`), Playwright (e2e via `test:e2e`).
**Target Platform**: Same as the rest of the platform — Node.js 20 / Next.js 14 on a Linux server.
**Project Type**: Web application (Next.js full-stack).
**Performance Goals**: `/my-admin` page MUST render in <300 ms p95 for a user holding admin on up to 10 leagues (the realistic ceiling for v1). The LeagueSwitcher's path-mapping decision MUST be synchronous (no extra fetch).
**Constraints**: No new HTTP endpoints required. Must not regress the SC-006 isolation guarantee (verified by `tests/integration/league-isolation.test.ts`).
**Scale/Scope**: Within the existing 50-league × 50-member envelope, expected admins-of-multiple-leagues users are a small subset (single-digit %). The feature must not penalise the common case (single-league admin or plain member).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

The project's `.specify/memory/constitution.md` is the unfilled template — no ratified principles exist to gate against. Per the speckit workflow, the gate evaluates the planning rigour rules baked into the existing 002 plan instead:

| Rule (sourced from spec.md and prior plan) | Status | Note |
|---|---|---|
| FR-014 (per-league role evaluation) | **Pass** — already enforced by `requireLeagueAdmin`. This work does not change authz. |
| SC-006 (cross-league isolation) | **Pass** — no new endpoints. Existing isolation tests cover the surface. |
| Branding neutrality (FR-005/SC-004) | **Pass** — new copy ("Leagues you administer") is industry-generic; covered by the existing branding scan at `tests/unit/branding/no-industry-references.test.ts`. |
| Server-side authorisation gate on every league surface | **Pass** — `/my-admin` is a Server Component that derives the admin list from `getServerUserFromCookie(token)` and never trusts client input. |

No violations. No entries in Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/002-multi-league-platform/
├── plan.md               # This file
├── research.md           # Phase 0 — design decisions for this delta
├── data-model.md         # Phase 1 — confirms no schema changes
├── quickstart.md         # Phase 1 — added section: verifying the multi-league admin flow
├── contracts/            # Phase 1 — confirms no new endpoints
│   ├── auth-contracts.md       # unchanged
│   ├── league-contracts.md     # unchanged
│   ├── platform-contracts.md   # unchanged
│   └── multi-admin-ux.md       # NEW — annotates client-side path-mapping rules
├── checklists/
│   └── requirements.md   # existing
├── spec.md
└── tasks.md              # existing — new tasks T101–T106 to be appended by /speckit.tasks
```

### Source Code (repository root)

```text
src/
├── app/
│   ├── (main)/
│   │   ├── my-admin/
│   │   │   └── page.tsx                      # NEW — admin home (server component)
│   │   ├── leagues/
│   │   │   └── page.tsx                      # MODIFY — group admin vs member
│   │   └── l/
│   │       └── [leagueSlug]/
│   │           └── admin/                    # unchanged
│   └── api/                                  # unchanged
├── components/
│   ├── league/
│   │   ├── LeagueSwitcher.tsx                # MODIFY — preserve /admin/<sub> sub-path
│   │   └── LeagueProvider.tsx                # unchanged
│   └── layout/
│       └── Sidebar.tsx                       # MODIFY — surface "My admin leagues" link
├── lib/
│   ├── authz/
│   │   └── league-scope.ts                   # unchanged
│   └── routing/
│       └── admin-path-mapper.ts              # NEW — pure function: (currentPath, targetLeague) → href
└── ...

tests/
├── integration/
│   └── multi-league-admin.test.ts            # NEW — verifies /my-admin list + path-mapper
├── unit/
│   └── routing/
│       └── admin-path-mapper.test.ts         # NEW — table-driven cases
└── e2e/
    └── multi-league-admin.spec.ts            # NEW — Playwright, optional (deferred per project pattern)
```

**Structure Decision**: Same web-app structure as `001-fpl-org-tracker` / `002-multi-league-platform`. The new page lives under `src/app/(main)/my-admin/` (no `[leagueSlug]` segment because it spans leagues). A new `src/lib/routing/` directory hosts the path-mapping helper so it can be unit-tested in isolation and re-used by both `LeagueSwitcher` (client) and any future SSR helper.

## Complexity Tracking

> Constitution Check has no violations — table intentionally empty.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| — | — | — |
