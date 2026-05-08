# Contracts: Platform Administration (Super Admin)

**Phase**: 1
**Feature**: 002-multi-league-platform

Every endpoint here invokes `requireSuperAdmin(req)` at the top. Standard `ApiResponse<T>` envelope, Zod-validated input, the same error semantics as the league contracts.

---

## GET /api/platform/leagues

List all leagues on the platform.

**Auth**: Super Admin.

**Query**: `page`, `limit` (defaults 1, 50); `status` ('active' | 'suspended') optional; `search` (substring match against `name` or `slug`) optional.

**Response 200**:
```ts
{
  success: true,
  data: Array<{
    id: string;
    slug: string;
    name: string;
    status: 'active' | 'suspended';
    memberCount: number;
    adminCount: number;
    miniLeagueId: number | null;
    createdAt: string;
    suspendedAt: string | null;
    lastActivityAt: string | null; // most recent AuditEvent.createdAt for this league
  }>,
  meta: { total, page, limit }
}
```

---

## POST /api/platform/leagues

Create a new league and assign an initial League Admin.

**Auth**: Super Admin.

**Request body**:
```ts
{
  name: string;                   // 1–80
  slug?: string;                  // auto-generated from name if omitted
  miniLeagueId?: number | null;
  logoUrl?: string | null;
  initialAdminEmail: string;      // required — the league must have an admin
  initialAdminManagerId?: number; // optional FPL Manager ID for the admin
  initialAdminDisplayName?: string;
}
```

**Behaviour**:
1. Validate. Reject if slug collides with current `League.slug` or `LeagueSlugHistory.slug`.
2. Create League row.
3. Ensure UserAccount exists for `initialAdminEmail` (create if missing).
4. Create LeagueMembership `{ leagueId, userAccountId, role: 'admin', source: 'invitation', isActive: true, managerId: initialAdminManagerId ?? <placeholder>, displayName: initialAdminDisplayName }`. If managerId is omitted, the row is created with `managerId: 0` placeholder and the admin is required to set it during onboarding.
5. Issue an Invitation + MagicLinkToken to `initialAdminEmail`, send the email.
6. Log AuditEvent `league.created`, `membership.added`, `invitation.issued`.

**Response 201**:
```ts
{
  success: true,
  data: {
    leagueId: string;
    leagueSlug: string;
    initialAdminInvitationId: string;
  }
}
```

---

## GET /api/platform/leagues/:leagueId

Super Admin view of a league: settings, members, recent audit. Same shape as `GET /api/leagues/:leagueId` plus full member list and last-50 audit entries.

**Auth**: Super Admin.

---

## POST /api/platform/leagues/:leagueId/suspend

Suspend a league.

**Auth**: Super Admin.

**Request body**:
```ts
{ reason?: string }
```

**Behaviour**:
1. Reject if already suspended.
2. Set `League.status = 'suspended'`, populate `suspendedAt`, `suspendedByUserAccountId`, `suspensionReason`.
3. Active sessions remain valid platform-wide but `requireLeagueMember` denies access to this league.
4. Log AuditEvent `league.suspended`.

**Response 200**: updated league.

---

## POST /api/platform/leagues/:leagueId/reinstate

Reverse a suspension.

**Auth**: Super Admin.

**Behaviour**: clear suspension fields, set `status='active'`, log `league.reinstated`.

**Response 200**: updated league.

---

## DELETE /api/platform/leagues/:leagueId

Hard-delete a league.

**Auth**: Super Admin.

**Behaviour**:
1. Confirm via `?confirm=<slug>` query parameter (server checks query value matches the league's slug); reject with 400 if mismatch — guards against accidental deletion.
2. Cascade-delete: LeagueMembership, Invitation, LeagueSlugHistory rows for this league.
3. AuditEvent rows are retained but `leagueId` is preserved as a string-only reference (foreign key relaxed to nullable on League delete).
4. UserAccounts with no remaining LeagueMemberships and no SuperAdmin role are left intact.
5. Log a final AuditEvent `league.deleted` with `leagueId=null`, details containing the deleted league's name and slug.

**Response 200**: `{ success: true, data: { deleted: true } }`.

---

## PATCH /api/platform/memberships/:membershipId/role

Promote or demote a member.

**Auth**: Super Admin.

**Request body**:
```ts
{ role: 'member' | 'admin' }
```

**Behaviour**:
1. Reject if demotion would leave the league with zero active admins.
2. Update role; log `membership.role_changed`.

**Response 200**: updated membership.

---

## GET /api/platform/users

List user accounts.

**Auth**: Super Admin.

**Query**: `page`, `limit`, `search` (email substring), `disabledOnly` (bool).

**Response 200**:
```ts
{
  success: true,
  data: Array<{
    id: string;
    email: string;
    displayName: string | null;
    createdAt: string;
    lastLoginAt: string | null;
    disabledAt: string | null;
    isSuperAdmin: boolean;
    membershipCount: number;
  }>,
  meta: { total, page, limit }
}
```

---

## POST /api/platform/users/:userId/super-admin

Grant Super Admin role.

**Auth**: Super Admin.

**Behaviour**:
1. Insert SuperAdmin row (or reactivate existing revoked row by setting `revokedAt = null`).
2. Log `super_admin.granted`.

**Response 200**: `{ success: true, data: { isSuperAdmin: true } }`.

---

## DELETE /api/platform/users/:userId/super-admin

Revoke Super Admin role.

**Auth**: Super Admin.

**Behaviour**:
1. Reject if the requester is the target AND there is only one active Super Admin (cannot lock yourself out — operator must use the bootstrap env var to recover).
2. Set `SuperAdmin.revokedAt = now`.
3. Log `super_admin.revoked`.

**Response 200**: `{ success: true, data: { isSuperAdmin: false } }`.

---

## POST /api/platform/users/:userId/disable

Disable a user account (revokes sessions and prevents future sign-ins).

**Auth**: Super Admin.

**Behaviour**:
1. Set `UserAccount.disabledAt = now`.
2. Set all that user's `Session.revokedAt = now`.
3. Log `user_account.disabled` (platform-level, leagueId=null).

**Response 200**: `{ success: true, data: { disabled: true } }`.

---

## POST /api/platform/users/:userId/enable

Reverse disable. Symmetrical; logs `user_account.enabled`.

---

## GET /api/platform/audit

Platform-wide audit feed.

**Auth**: Super Admin.

**Query**: `page`, `limit`, `since`, `actorUserAccountId`, `leagueId`, `action`.

**Response 200**: same row shape as `GET /api/leagues/:leagueId/audit`, but unfiltered by league.
