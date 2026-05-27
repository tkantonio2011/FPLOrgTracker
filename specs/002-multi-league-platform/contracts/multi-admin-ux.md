# Contracts: Multi-League Admin UX

**Phase**: 1
**Feature**: 002-multi-league-platform (UX delta — multi-admin)
**Date**: 2026-05-13

This delta introduces **no new HTTP endpoints**. The contracts below describe two client-side / Server-Component surfaces and the pure routing function that backs them.

---

## Surface 1 — `/my-admin` (Server Component page)

**Route**: `GET /my-admin`

**Auth**: Requires a valid session (redirects to `/sign-in?redirect=/my-admin` if absent). No additional gate — the page lists only memberships the user actually holds, so non-admins see an empty/explanatory state rather than a 403.

**Data source**: `getServerUserFromCookie(token)` → filter `memberships` to those with `role === 'admin' && isActive === true`. No fetch.

**Rendered states**:

| Condition | Render |
|---|---|
| No session | `redirect('/sign-in?redirect=/my-admin')` |
| Session present, 0 admin memberships | Friendly message: "You don't administer any leagues. If a colleague is expecting you to manage one, ask them to promote you." Plus a "Back to my leagues" link → `/leagues`. |
| Session present, ≥1 admin membership(s) | A list of league cards. Each card shows: league name, status chip (Active / Suspended), member count placeholder dash (count is computed client-side via the existing `/api/leagues/{id}` GET when the card is hovered — optional v2 enhancement; v1 renders without count). Card actions: Settings, Members, Digest, Audit (deep links to `/l/<slug>/admin/<sub>`). Suspended leagues: actions disabled. |

**Performance contract**: Page must render in <300 ms p95 for a user holding admin on up to 10 leagues. Achieved because no DB write, no extra fetch, single Prisma query (`getServerUserFromCookie` already does it once).

---

## Surface 2 — Modified `/leagues` chooser

**Route**: `GET /leagues` (already exists, modify rendering only)

**Auth**: unchanged.

**New rendering rule**: When the filtered active-membership list contains BOTH roles (≥1 admin AND ≥1 non-admin):

```
┌────────────────────────────────────┐
│ Choose a league                    │
│                                    │
│ Leagues you administer             │
│  ┌──────────────────────────────┐  │
│  │ Acme FPL          [admin]    │  │
│  │   → Settings  → Members      │  │
│  └──────────────────────────────┘  │
│                                    │
│ Leagues you're a member of         │
│  ┌──────────────────────────────┐  │
│  │ Beta FPL                     │  │
│  └──────────────────────────────┘  │
│                                    │
│  (Super Admin footer if applicable)│
└────────────────────────────────────┘
```

When the list is single-role (all-admin or all-member): render the single-list layout that exists today. No degenerate empty group.

The legacy-URL forwarding (`?next=<path>` sanitised against open-redirect) carries through unchanged in both groups.

---

## Surface 3 — Modified `LeagueSwitcher` dropdown

**Component**: `src/components/league/LeagueSwitcher.tsx` (already exists, modify the href computation).

**Existing behaviour**: `href={`/l/${m.leagueSlug}/standings`}` for every entry.

**New behaviour**: `href={mapAdminPath(currentPathname, m.leagueSlug, m.role)}`.

The `Admin` chip already shown by T036 stays. The membership ordering is unchanged.

---

## Pure function — `mapAdminPath`

**Module**: `src/lib/routing/admin-path-mapper.ts`

**Signature**:
```ts
export function mapAdminPath(
  currentPath: string,
  targetLeagueSlug: string,
  targetRole: 'admin' | 'member'
): string;
```

**Behaviour table**:

| `currentPath` | `targetRole` | Returned href |
|---|---|---|
| `/l/<src>/admin` | `admin` | `/l/<target>/admin` |
| `/l/<src>/admin/settings` | `admin` | `/l/<target>/admin/settings` |
| `/l/<src>/admin/members` | `admin` | `/l/<target>/admin/members` |
| `/l/<src>/admin/digest` | `admin` | `/l/<target>/admin/digest` |
| `/l/<src>/admin/audit` | `admin` | `/l/<target>/admin/audit` |
| `/l/<src>/admin/members/<id>` (or deeper) | `admin` | `/l/<target>/admin/members` *(strip the per-id segment because membership ids are not portable across leagues)* |
| `/l/<src>/admin/<anything>` | `member` | `/l/<target>/standings` |
| `/l/<src>/standings` (or any non-admin path) | `admin` or `member` | `/l/<target>/standings` |
| `/my-admin` | `admin` or `member` | `/l/<target>/standings` *(no admin-context to preserve when coming from the cross-league home)* |
| `/leagues` or any other non-`/l/` path | `admin` or `member` | `/l/<target>/standings` |

**Properties**:
- Pure (no side effects, no I/O).
- Idempotent: `mapAdminPath(mapAdminPath(p, s, r), s, r) === mapAdminPath(p, s, r)`.
- Defensive against trailing slashes and query strings: only the pathname is consumed; trailing `/` is normalised; query and hash are dropped from the output (the switcher always navigates to a clean URL).

**Test coverage**: every row of the table is one test case in `tests/unit/routing/admin-path-mapper.test.ts`.

---

## Surface 4 — Modified `Sidebar`

**Component**: `src/components/layout/Sidebar.tsx` (already exists, add one conditional entry).

**Visibility rule**: render the "My admin leagues" entry IFF:
- the sidebar is rendering inside a league shell (`leagueSlug !== null`), AND
- the current user has ≥ 2 active admin memberships.

**Data source**: read `memberships[]` from a top-level provider that already wraps the league shell (or via `useQuery(['me-leagues'])` matching the LeagueSwitcher). No new fetch.

**Link target**: `/my-admin`.

**Suppression cases**:
- Signed-out users (sidebar isn't rendered).
- Single-league admins (the existing per-league "Admin" entry suffices).
- Plain members (no admin role anywhere — the link would 0-list and be misleading).

---

## Error semantics

There are no new error responses. Every endpoint touched in `/my-admin` and the modified chooser path is read-only and the only failure modes are the existing session and database availability errors, surfaced as the usual error boundaries.
