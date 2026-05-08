# Implementation Plan: Multi-League Platform

**Branch**: `002-multi-league-platform` | **Date**: 2026-05-08 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/002-multi-league-platform/spec.md`

---

## Summary

Convert the existing single-tenant FPL tracker (built for one organisation, currently branded for an energy-trading company) into a multi-tenant platform that hosts an unlimited number of independent leagues. Each league has its own League Admin who manages members and settings; an optional Super Admin role is granted at the platform level for cross-league operations. Authentication is replaced wholesale: passwords are removed and sign-in becomes passwordless email magic-links, with League Admin invitations delivered as the recipient's first magic-link. All league-scoped queries are gated by an explicit `leagueId` derived from the authenticated user's per-league membership; no shared global "current organisation" state survives. The existing data is migrated in place as the first League and all hard-coded industry/company references are stripped.

## Technical Context

**Language/Version**: TypeScript 5.x (existing codebase)
**Primary Dependencies**: Next.js 14 (App Router), TanStack Query v5, Prisma 5 (SQLite), Tailwind CSS, Recharts, nodemailer (already present), Zod (to be added for input validation)
**Storage**: SQLite via Prisma (existing) — schema changes are additive and migrating; SQLite scales to the 50-leagues × 50-members target. No move to Postgres required for v1, but the schema is designed to migrate cleanly later.
**Testing**: Vitest + React Testing Library (existing); add integration tests for the authorisation/scoping layer; Playwright recommended for the cross-league isolation E2E suite.
**Target Platform**: Web (desktop-first, mobile-responsive). Deploys as a single Next.js Node server (currently EC2 / Amazon Linux 2023 per Prisma binary targets, also runs locally).
**Project Type**: Full-stack web application (single Next.js project; no separate backend service).
**Performance Goals**: Member-facing pages no slower than the single-tenant baseline; SC-007 target — 50 leagues × 50 members concurrent without measurable regression. League-scope check overhead must be < 10 ms per request.
**Constraints**:
- Existing FPL API integration and caching strategy carries over unchanged (FPL data is global, not per-league).
- Email delivery is now a hard prerequisite — magic-link is the only sign-in mechanism. SMTP credentials must be present in production.
- Backwards-incompatible schema migration; one-shot data migration is acceptable (single existing tenant).
- All league-scoped routes must enforce `leagueId` server-side; UI-only enforcement is forbidden.

**Scale/Scope**:
- 50 leagues × 50 members = 2,500 active LeagueMemberships in v1.
- 1 Platform record, ≤ 5 Super Admins.
- ~25 existing API route handlers to be converted from "implicit single org" to "explicit league context".
- ~20 page routes (under `(main)/`) to be wrapped in a league context provider.

---

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

The project constitution (`.specify/memory/constitution.md`) is currently a placeholder template — none of the principle slots are filled in. There are no ratified gates to evaluate.

**Status**: PASS (no constitutional violations because no constitutional principles are defined). This plan should be re-evaluated if and when `/speckit.constitution` is run to ratify principles. A separate observation captured for future review: the migration adds two cross-cutting concerns (authentication and tenancy) that would benefit from explicit constitutional principles around (a) server-side authorisation enforcement and (b) zero implicit tenancy state — those should be considered if the constitution is later ratified.

**Post-Phase-1 Re-check**: PASS — no new violations introduced by the design in `data-model.md` and `contracts/`.

---

## Project Structure

### Documentation (this feature)

```text
specs/002-multi-league-platform/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   ├── auth-contracts.md          # Magic-link sign-in, sessions, invitations
│   ├── league-contracts.md        # League CRUD + member management (League Admin scope)
│   ├── platform-contracts.md      # Super Admin endpoints
│   └── scoped-route-contracts.md  # Migration map: existing routes → league-scoped equivalents
├── checklists/
│   └── requirements.md  # Spec quality checklist (already created by /speckit.specify)
└── tasks.md             # Phase 2 output (/speckit.tasks command — NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
src/
├── app/
│   ├── (auth)/
│   │   ├── sign-in/page.tsx          # NEW — magic-link request form (replaces login/register)
│   │   ├── verify/page.tsx           # NEW — magic-link landing (consumes ?token=)
│   │   └── invitations/[token]/page.tsx  # NEW — accept-invitation flow
│   │
│   ├── (main)/
│   │   ├── leagues/                  # NEW — league switcher when user belongs to >1 league
│   │   │   └── page.tsx
│   │   ├── l/[leagueSlug]/           # NEW — every existing (main) page moves under here
│   │   │   ├── layout.tsx                  # Loads LeagueContext, enforces membership
│   │   │   ├── page.tsx                    # Was (main)/page.tsx — landing
│   │   │   ├── standings/page.tsx          # Was (main)/standings/page.tsx
│   │   │   ├── members/[managerId]/page.tsx
│   │   │   ├── suggestions/[managerId]/page.tsx
│   │   │   ├── ownership/page.tsx
│   │   │   ├── live/page.tsx
│   │   │   ├── h2h/page.tsx
│   │   │   ├── ... (all existing main pages: agony, bench, captain-history, captain-whatif,
│   │   │   │       differentials, form, luck, player-status, regret, season-stats, transfers,
│   │   │   │       changelog stays at root)
│   │   │   └── admin/                # League-scoped admin (League Admin role)
│   │   │       ├── settings/page.tsx       # League name, logo, mini-league ID
│   │   │       ├── members/page.tsx        # Member CRUD (was /admin)
│   │   │       └── audit/page.tsx          # League audit trail
│   │   │
│   │   └── platform/                 # NEW — Super Admin area (top-level, no league)
│   │       ├── layout.tsx                  # Enforces SuperAdmin role
│   │       ├── page.tsx                    # Platform dashboard (all leagues)
│   │       ├── leagues/
│   │       │   ├── new/page.tsx            # Create league + assign initial admin
│   │       │   └── [leagueId]/page.tsx     # League detail (members, suspend/delete, role mgmt)
│   │       ├── users/page.tsx              # All user accounts
│   │       └── audit/page.tsx              # Platform-wide audit trail
│   │
│   └── api/
│       ├── auth/
│       │   ├── magic-link/route.ts         # NEW — POST email → send magic link
│       │   ├── verify/route.ts             # NEW — GET ?token=… → consume + set session
│       │   ├── logout/route.ts             # KEEP, refactored to clear session row
│       │   └── me/route.ts                 # KEEP, returns UserAccount + memberships
│       │
│       ├── invitations/
│       │   ├── route.ts                    # NEW — POST (League Admin invites)
│       │   └── [token]/route.ts            # NEW — GET token info, POST accept
│       │
│       ├── leagues/
│       │   └── [leagueId]/
│       │       ├── route.ts                # GET (read), PATCH (update), DELETE (Super Admin)
│       │       ├── members/route.ts        # GET, POST (add by managerId)
│       │       ├── members/[membershipId]/route.ts   # PATCH, DELETE
│       │       ├── sync/route.ts           # POST — re-import from FPL mini-league
│       │       ├── audit/route.ts          # GET
│       │       └── (every existing scoped endpoint nested here — see contracts/scoped-route-contracts.md)
│       │
│       └── platform/                       # NEW — Super Admin only
│           ├── leagues/route.ts            # GET (list all), POST (create league)
│           ├── leagues/[leagueId]/suspend/route.ts
│           ├── users/route.ts
│           ├── users/[userId]/super-admin/route.ts  # POST grant, DELETE revoke
│           ├── memberships/[membershipId]/role/route.ts  # PATCH promote/demote
│           └── audit/route.ts
│
├── components/
│   ├── auth/                         # NEW — MagicLinkForm, InvitationBanner
│   ├── league/                       # NEW — LeagueSwitcher, LeagueBadge, LeagueLogo
│   ├── platform/                     # NEW — LeagueListTable, RoleBadge, SuspensionBadge
│   ├── layout/                       # AppShell/Nav updated to use LeagueContext
│   └── (existing folders unchanged: standings, performance, suggestions, ownership, ui, ...)
│
├── lib/
│   ├── auth/
│   │   ├── magic-link.ts             # NEW — token issue, hash, verify
│   │   ├── session.ts                # REPLACED — server-side Session table; sliding TTL
│   │   ├── current-user.ts           # NEW — getServerUser() helper for route handlers/pages
│   │   └── email.ts                  # NEW — sendMagicLink, sendInvitation (uses nodemailer)
│   │
│   ├── authz/                        # NEW — authorisation layer
│   │   ├── league-scope.ts           # requireLeagueMember, requireLeagueAdmin
│   │   ├── platform-scope.ts         # requireSuperAdmin
│   │   └── league-resolver.ts        # leagueSlug → leagueId, with membership check
│   │
│   ├── audit/                        # NEW
│   │   └── log.ts                    # logAuditEvent({ leagueId?, actor, action, target, details })
│   │
│   ├── fpl/                          # UNCHANGED (FPL data is global)
│   ├── suggestions/                  # UNCHANGED
│   ├── db/                           # Prisma client
│   ├── cache.ts                      # UNCHANGED — already keyed by request, but verify no org-leak
│   └── branding/
│       └── strings.ts                # NEW — generic copy constants (replaces inline org-name strings)
│
└── prisma/
    ├── schema.prisma                 # NEW models: Platform, League, UserAccount, LeagueMembership,
    │                                  # SuperAdmin, MagicLinkToken, Session, Invitation, AuditEvent
    └── migrations/
        └── 002_multi_league/
            ├── migration.sql         # Schema migration
            └── seed.ts               # Data migration: Organisation→League, Member→LeagueMembership,
                                      # User→UserAccount (passwords dropped), bootstrap SuperAdmin

tests/
├── unit/
│   ├── authz/                        # league-scope, platform-scope, isolation matrix
│   ├── auth/                         # magic-link issue/consume, expiry, single-use
│   └── (existing suggestions/, fpl/ unchanged)
├── integration/                      # NEW
│   ├── auth-flow.test.ts             # full sign-in → session → /api/auth/me
│   ├── league-isolation.test.ts      # league A user cannot read league B data via API
│   ├── invitation-flow.test.ts       # invite → magic link → accept → membership created
│   └── migration.test.ts             # seed runs cleanly against an existing 001-shaped DB
└── e2e/                              # NEW (Playwright)
    └── multi-league.spec.ts          # cross-league isolation in browser
```

**Structure Decision**: Keep the single Next.js project. Introduce a route segment `app/(main)/l/[leagueSlug]/...` that wraps every existing member-facing page in an explicit league context, with a sibling `app/(main)/platform/...` segment for Super Admin. API routes follow the same shape: existing endpoints move to `/api/leagues/[leagueId]/...` and are required to validate the requester's membership before touching data. No separate microservice — the change is structural and authorisation-layer, not a service split.

---

## Complexity Tracking

> No constitutional violations because no constitution principles are ratified. The complexity that does exist (introducing tenancy, replacing auth) is intrinsic to the feature — there is no "simpler alternative" that delivers the spec.

| Concern | Why it's necessary | Simpler alternative considered |
|---------|---------------------|--------------------------------|
| New Session table (server-side) replacing the existing stateless HMAC token | Magic-link sign-in needs single-use tokens and admin revocation. Stateless tokens cannot be revoked. | Keep stateless tokens with a JWT-style `iat` claim — rejected because admin-initiated revocation (FR-022 league suspension, FR-023 deletion) and the magic-link single-use guarantee both require a server-side record. |
| `LeagueMembership` as a separate model (not a join column on `Member`) | A user can belong to multiple leagues and hold different roles in each (FR-004, FR-014). | Keep `Member` as 1:1 with `User` and add `leagueId` — rejected because it cannot represent the same person in two leagues without duplicating their identity. |
| New `app/(main)/l/[leagueSlug]/` route segment (large move of existing pages) | All existing member-facing routes must derive their data from an explicit league. URL-level scoping makes membership check, share-links, and bookmarking all unambiguous. | Keep current URLs and resolve league via session/cookie — rejected because (a) it makes URL bookmarks ambiguous when a user is in multiple leagues, (b) it makes server-side cache keys harder to reason about, and (c) it's harder to test with automated isolation tests. |
| Schema migration with data migration in a single step | The existing single-tenant data must be preserved as the first League (FR-024). | Wipe and re-seed — rejected; loses existing members' history and breaks SC-005. |

No further complexity is introduced beyond what the spec strictly requires.
