# Contracts: League Management (League Admin Scope)

**Phase**: 1
**Feature**: 002-multi-league-platform

All endpoints below are scoped to a `:leagueId`. Every handler invokes `requireLeagueAdmin(req, leagueId)` (or `requireLeagueMember` for read-only) at the top. Standard `ApiResponse<T>` envelope applies. Zod-validated bodies. Error semantics: `401` not signed in, `403` not authorised, `404` league not found or not visible to caller, `409` conflict (e.g., duplicate manager ID).

---

## GET /api/leagues/:leagueId

Read a league's settings and counts.

**Auth**: League Member of `:leagueId` (or Super Admin).

**Response 200**:
```ts
{
  success: true,
  data: {
    id: string;
    slug: string;
    name: string;
    logoUrl: string | null;
    miniLeagueId: number | null;
    status: 'active' | 'suspended';
    memberCount: number;
    adminCount: number;
    createdAt: string;
    suspensionReason: string | null;
    digestPrompt: string | null;
  }
}
```

---

## PATCH /api/leagues/:leagueId

Update league settings.

**Auth**: League Admin of `:leagueId` (or Super Admin).

**Request body** (all optional):
```ts
{
  name?: string;          // 1–80
  slug?: string;          // 1–60 lowercase + hyphens; creates LeagueSlugHistory if changed
  logoUrl?: string | null;
  miniLeagueId?: number | null;
  digestPrompt?: string | null;
}
```

**Behaviour**:
1. Validate; reject empty patch.
2. If `slug` changes, write LeagueSlugHistory row, then update.
3. If `miniLeagueId` changes, do **not** auto-sync — admin must trigger `/sync` explicitly.
4. Log AuditEvent `league.updated` with details: `{ before, after }`.

**Response 200**: updated league shape (same as GET).

---

## POST /api/leagues/:leagueId/sync

Re-import members from the configured FPL mini-league.

**Auth**: League Admin of `:leagueId` (or Super Admin).

**Behaviour**:
1. Reject if `miniLeagueId` is null.
2. Fetch `/leagues-classic/{miniLeagueId}/standings/` from FPL API (server-side).
3. For each manager in the returned standings:
   - If a LeagueMembership exists in this league with that `managerId`: refresh `teamName`, leave other fields alone.
   - Else: create a new LeagueMembership `{ source: 'league', role: 'member', isActive: true, userAccountId: null }`. The membership has no UserAccount yet (the imported manager will need to be invited by email separately to actually sign in).
4. Members with `source: 'manual'` or `source: 'invitation'` are NOT removed if they don't appear in the FPL mini-league.
5. Log AuditEvent `membership.added` per new membership.

**Response 200**:
```ts
{ success: true, data: { added: number; refreshed: number; total: number; } }
```

**Response 422**: `{ success: false, error: 'Mini-league is private or not found' }` if the FPL API returns 404 or an empty payload.

---

## GET /api/leagues/:leagueId/members

List members of a league.

**Auth**: League Member of `:leagueId` (or Super Admin).

**Query**:
- `includeInactive` (default false)
- `page`, `limit` (defaults 1, 100)

**Response 200**:
```ts
{
  success: true,
  data: Array<{
    membershipId: string;
    managerId: number;
    displayName: string | null;
    teamName: string | null;
    role: 'member' | 'admin';
    source: 'league' | 'manual' | 'invitation';
    isActive: boolean;
    pointsDeductionPerGw: number;
    addedAt: string;
    hasUserAccount: boolean;     // false if migrated/imported without email
    email: string | null;        // visible only to League Admin and Super Admin
  }>,
  meta: { total, page, limit }
}
```

For non-admin requesters, `email` is omitted from each row.

---

## POST /api/leagues/:leagueId/members

Add a member by FPL Manager ID (manual add).

**Auth**: League Admin of `:leagueId` (or Super Admin).

**Request body**:
```ts
{
  managerId: number;
  displayName?: string;
  email?: string;     // if provided, an invitation is automatically issued
}
```

**Behaviour**:
1. Reject if `(leagueId, managerId)` already exists.
2. Fetch the manager's basic profile from FPL API (`entry/{managerId}/`) to seed `teamName`. If FPL returns 404 or private, reject with 422.
3. Create LeagueMembership `{ source: 'manual', role: 'member', isActive: true, userAccountId: null }`.
4. If `email` provided: also create an Invitation (and email it). The membership is created up front so the user appears in the leaderboard immediately even before they sign in.
5. Log AuditEvent `membership.added` and (if applicable) `invitation.issued`.

**Response 201**: the membership shape.

---

## PATCH /api/leagues/:leagueId/members/:membershipId

Update a member.

**Auth**: League Admin of `:leagueId` (or Super Admin).

**Request body** (all optional):
```ts
{
  displayName?: string | null;
  isActive?: boolean;
  pointsDeductionPerGw?: number;
  role?: 'member' | 'admin';   // promotion/demotion
  email?: string | null;       // attach/replace the email used for sign-in invitations
}
```

**Behaviour**:
1. Validate.
2. If `role: 'member'` and the membership is the league's only active admin → reject with 409 `{ error: 'Cannot demote the only admin' }`.
3. If `email` changes and the membership currently has no UserAccount: link or create a UserAccount; if the account is new, automatically issue a sign-in magic-link (so the member can claim their access).
4. Log AuditEvent: `membership.role_changed` / `membership.deactivated` / `membership.reactivated` as applicable.

**Response 200**: updated membership.

---

## DELETE /api/leagues/:leagueId/members/:membershipId

Remove a member from the league.

**Auth**: League Admin of `:leagueId` (or Super Admin).

**Behaviour**:
1. Reject if removing the only active admin.
2. Hard-delete the LeagueMembership row.
3. Log AuditEvent `membership.removed`.
4. If the underlying UserAccount has no other LeagueMemberships and no SuperAdmin role, the account is left intact (the user can still sign in but will see "you have no leagues" — Super Admin can disable the account if desired).

**Response 200**: `{ success: true, data: { removed: true } }`.

---

## GET /api/leagues/:leagueId/audit

League-scoped audit feed.

**Auth**: League Admin of `:leagueId` (or Super Admin).

**Query**: `page`, `limit` (defaults 1, 50); `since` (ISO datetime) optional.

**Response 200**:
```ts
{
  success: true,
  data: Array<{
    id: string;
    action: string;
    actor: { kind: 'user' | 'migration' | 'system'; userAccountId?: string; email?: string };
    targetKind: string;
    targetId: string | null;
    details: Record<string, unknown>;
    createdAt: string;
  }>,
  meta: { total, page, limit }
}
```
