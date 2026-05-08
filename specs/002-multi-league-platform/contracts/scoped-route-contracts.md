# Contracts: Scoped Route Migration Map

**Phase**: 1
**Feature**: 002-multi-league-platform

This document maps every existing API route handler to its multi-tenant equivalent. The migration rule is:

> Any route handler that today reads or writes `Member`, `Organisation`, or anything derived from them MUST move under `/api/leagues/:leagueId/...` and gate access via `requireLeagueMember(req, leagueId)` (or `requireLeagueAdmin` for write paths). Routes that only touch global FPL data (e.g., `/api/players`, `/api/fixtures`) MAY remain at the top level but must still require an authenticated user.

Standard `ApiResponse<T>` envelope, Zod input validation, and the four-error grid (`401/403/404/409`) apply to every handler unless noted. Response payload shapes are unchanged from the existing 001 implementation; only the URL and the authorisation gate change.

---

## Member-facing read endpoints (move to league scope)

| Existing route | New route | Auth gate |
|---|---|---|
| `GET /api/standings` | `GET /api/leagues/:leagueId/standings` | `requireLeagueMember` |
| `GET /api/gameweeks` | `GET /api/leagues/:leagueId/gameweeks` | `requireLeagueMember` |
| `GET /api/members` | `GET /api/leagues/:leagueId/members` | `requireLeagueMember` (defined in `league-contracts.md`) |
| `GET /api/members/:managerId/performance` | `GET /api/leagues/:leagueId/members/:managerId/performance` | `requireLeagueMember`, plus the `:managerId` MUST belong to a LeagueMembership in `:leagueId` |
| `GET /api/members/:managerId/squad` | `GET /api/leagues/:leagueId/members/:managerId/squad` | same |
| `GET /api/members/:managerId/narrative` | `GET /api/leagues/:leagueId/members/:managerId/narrative` | same; LLM prompt now uses `League.name` not the hard-coded org name |
| `GET /api/ownership` | `GET /api/leagues/:leagueId/ownership` | `requireLeagueMember` |
| `GET /api/suggestions/transfers` | `GET /api/leagues/:leagueId/suggestions/transfers` | `requireLeagueMember`; `?managerId=` must belong to the league |
| `GET /api/suggestions/captain` | `GET /api/leagues/:leagueId/suggestions/captain` | same |
| `GET /api/suggestions/chips` | `GET /api/leagues/:leagueId/suggestions/chips` | same |
| `GET /api/live` | `GET /api/leagues/:leagueId/live` | `requireLeagueMember` |
| `GET /api/h2h` | `GET /api/leagues/:leagueId/h2h` | `requireLeagueMember` |
| `GET /api/league-history` | `GET /api/leagues/:leagueId/league-history` | `requireLeagueMember` |
| `GET /api/highlights` | `GET /api/leagues/:leagueId/highlights` | `requireLeagueMember` |
| `GET /api/agony` | `GET /api/leagues/:leagueId/agony` | `requireLeagueMember` |
| `GET /api/bench` | `GET /api/leagues/:leagueId/bench` | `requireLeagueMember` |
| `GET /api/captain-history` | `GET /api/leagues/:leagueId/captain-history` | `requireLeagueMember` |
| `GET /api/captain-whatif` | `GET /api/leagues/:leagueId/captain-whatif` | `requireLeagueMember` |
| `GET /api/differentials` | `GET /api/leagues/:leagueId/differentials` | `requireLeagueMember` |
| `GET /api/form` | `GET /api/leagues/:leagueId/form` | `requireLeagueMember` |
| `GET /api/luck` | `GET /api/leagues/:leagueId/luck` | `requireLeagueMember` |
| `GET /api/player-status` | `GET /api/leagues/:leagueId/player-status` | `requireLeagueMember` |
| `GET /api/regret` | `GET /api/leagues/:leagueId/regret` | `requireLeagueMember` |
| `GET /api/season-stats` | `GET /api/leagues/:leagueId/season-stats` | `requireLeagueMember` |
| `GET /api/transfers` | `GET /api/leagues/:leagueId/transfers` | `requireLeagueMember` |
| `GET /api/pain-stats` | `GET /api/leagues/:leagueId/pain-stats` | `requireLeagueMember` |
| `GET /api/horoscope` | `GET /api/leagues/:leagueId/horoscope` | `requireLeagueMember`; LLM prompt uses `League.name` |
| `GET /api/gw-report` | `GET /api/leagues/:leagueId/gw-report` | `requireLeagueMember`; LLM prompt uses `League.name` |
| `GET /api/trash-talk` | `GET /api/leagues/:leagueId/trash-talk` | `requireLeagueMember`; LLM prompt uses `League.name` |
| `GET /api/tribunal` | `GET /api/leagues/:leagueId/tribunal` | `requireLeagueMember`; LLM prompt uses `League.name` |
| `GET /api/titles` | `GET /api/leagues/:leagueId/titles` | `requireLeagueMember` |

---

## Routes that stay at the top level (global FPL data — no league context)

| Route | Auth gate | Notes |
|---|---|---|
| `GET /api/players` | `requireSession` | Bootstrap-static is global; no league filtering needed |
| `GET /api/fixtures` | `requireSession` | Same |

These routes must still require a signed-in user — anonymous access is no longer permitted anywhere on the platform.

---

## Routes that are removed or replaced

| Existing route | What happens |
|---|---|
| `POST /api/auth/login` (password) | **Removed** — replaced by `POST /api/auth/magic-link` + `GET /api/auth/verify` |
| `POST /api/auth/register` (password create) | **Removed** — replaced by invitation flow |
| `POST /api/admin/check`, `POST /api/admin/verify` (admin PIN) | **Removed** — replaced by League Admin role + Super Admin role |
| `POST /api/org/sync` (singleton org) | **Replaced** by `POST /api/leagues/:leagueId/sync` |

The existing `/api/auth/logout` and `/api/auth/me` routes are kept but refactored per `auth-contracts.md`.

---

## Route Handler Skeleton (canonical pattern)

Every league-scoped route handler follows this exact shape. Deviations are caught by an integration test that scans the handler files for the auth helper call.

```ts
// src/app/api/leagues/[leagueId]/standings/route.ts
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireLeagueMember } from '@/lib/authz/league-scope';
import { ok, fail } from '@/lib/http/response';
import { getStandings } from '@/lib/repositories/standings';

const querySchema = z.object({
  gw: z.coerce.number().int().min(1).max(38).optional(),
});

export async function GET(
  req: NextRequest,
  ctx: { params: { leagueId: string } }
) {
  try {
    const { league } = await requireLeagueMember(req, ctx.params.leagueId);
    const query = querySchema.parse(Object.fromEntries(req.nextUrl.searchParams));
    const data = await getStandings({ leagueId: league.id, gw: query.gw });
    return ok(data);
  } catch (err) {
    return fail(err); // converts AuthzError / ZodError to standard envelope
  }
}
```

**Required elements**:
1. `requireLeagueMember(req, leagueId)` (or `requireLeagueAdmin` for writes) at the top of the `try`.
2. Zod schema for query/body — no untyped `req.json()` reaching the repository.
3. Repository function takes `leagueId` as a typed parameter.
4. `ok` / `fail` envelope helpers — never raw `NextResponse.json` with ad-hoc shapes.

A linter or static-analysis check (e.g., a custom ESLint rule) is recommended to enforce that every handler under `/api/leagues/[leagueId]/` calls one of the `require*` helpers. This is the single highest-leverage piece of automation for SC-006 (95% direct-access denials).
