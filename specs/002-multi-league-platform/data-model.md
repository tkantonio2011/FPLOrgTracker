# Data Model: Multi-League Platform

**Phase**: 1
**Branch**: `002-multi-league-platform`
**Date**: 2026-05-08

This document describes the persisted entities for the multi-league platform. It is the authoritative source for the new Prisma schema (`prisma/schema.prisma`) and the migration script (`prisma/migrations/002_multi_league/`). FPL-sourced entities (Gameweek, Player, Squad, Fixture, Chip, Suggestion) are unchanged from `001-fpl-org-tracker/data-model.md` — they remain runtime-derived from the FPL API and are not persisted, but every query that produces or aggregates them is now scoped through a `leagueId`.

---

## Entities

### Platform

A singleton describing the deployment. Created on first boot.

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | cuid; always one row |
| `name` | string | Platform name shown in default branding (e.g., "FPL Tracker") |
| `defaultLogoUrl` | string \| null | Fallback logo when a league has none |
| `createdAt` | datetime | First boot |

**Constraints**: Exactly one row exists. Future platform-level settings (default rate limits, default email "from") attach here.

---

### League

A single tenant. Replaces the old `Organisation`.

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | cuid |
| `slug` | string | URL slug, unique platform-wide (`acme-fpl-2026`); 1–60 chars; lowercase, hyphenated |
| `name` | string | Display name shown to members; 1–80 chars |
| `logoUrl` | string \| null | Optional league logo |
| `miniLeagueId` | int \| null | FPL mini-league ID (for member auto-import); unique platform-wide if set |
| `status` | enum | `active` \| `suspended` |
| `digestPrompt` | string \| null | Per-league LLM prompt customisation (carried over from existing `Organisation.digestPrompt`) |
| `digestCacheGw` | int \| null | Cached digest gameweek number |
| `digestCacheJson` | string \| null | Cached digest JSON payload |
| `createdAt` | datetime | When created |
| `createdByUserAccountId` | string | UserAccount that created the league (Super Admin or migration) |
| `suspendedAt` | datetime \| null | When suspended (status=suspended) |
| `suspendedByUserAccountId` | string \| null | Who suspended |
| `suspensionReason` | string \| null | Optional admin note |

**Indexes**: unique `(slug)`, unique `(miniLeagueId)` where not null.

**State Transitions**:

```
active → suspended  (Super Admin action; sets suspendedAt, suspendedByUserAccountId, suspensionReason)
suspended → active  (Super Admin reinstate; clears suspension fields)
{any} → deleted     (hard delete via Super Admin → cascade to LeagueMembership, Invitation, AuditEvent.leagueId nullified or cascaded)
```

---

### LeagueSlugHistory

Tracks past slugs so old URLs continue to redirect when a League Admin renames their league's slug.

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | cuid |
| `leagueId` | string | Foreign key to League |
| `slug` | string | The old slug |
| `replacedAt` | datetime | When this slug stopped being current |

**Indexes**: unique `(slug)` (must not collide with current `League.slug`).

---

### UserAccount

A platform-level identity for a real person. One row per email.

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | cuid |
| `email` | string | Lowercase, unique, validated; the magic-link target |
| `displayName` | string \| null | Optional default name across leagues |
| `createdAt` | datetime | When the account was first observed (first sign-in or invitation) |
| `lastLoginAt` | datetime \| null | Most recent successful magic-link verification |
| `disabledAt` | datetime \| null | Set by Super Admin to block future sign-ins (sessions are also revoked) |

**Indexes**: unique `(email)`.

**Constraints**:
- Email is normalised to lowercase before insertion.
- A disabled account cannot create a session even if it holds an unused magic-link.

---

### LeagueMembership

The join between a UserAccount and a League. Holds per-league role and FPL identity.

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | cuid |
| `leagueId` | string | Foreign key to League |
| `userAccountId` | string \| null | Foreign key to UserAccount; null only for migrated members without a known email (cannot sign in until populated) |
| `managerId` | int | FPL Manager ID for this user IN THIS LEAGUE (typically the same across leagues for a given user, but not enforced) |
| `displayName` | string \| null | Per-league display name override; falls back to UserAccount.displayName, then to FPL team manager name |
| `teamName` | string \| null | Cached FPL team name (refreshed on sync) |
| `role` | enum | `member` \| `admin` |
| `source` | enum | `league` (auto-imported from mini-league) \| `manual` (added by League Admin via Manager ID) \| `invitation` (joined via accepted invitation) |
| `pointsDeductionPerGw` | int | Carry-over from existing `Member.pointsDeductionPerGw` |
| `isActive` | boolean | League Admin or Super Admin can deactivate without deleting; deactivated members are hidden from leaderboards |
| `addedAt` | datetime | When the membership was created |
| `addedByUserAccountId` | string \| null | Who added this member (null for migration-seeded rows; logged in AuditEvent regardless) |

**Indexes**:
- unique `(leagueId, userAccountId)` where userAccountId not null — a person can only be in a given league once
- unique `(leagueId, managerId)` — a Manager ID can only appear once per league
- index `(userAccountId)` — list "all leagues I'm in"
- index `(leagueId, isActive)` — leaderboard scans

**Constraints**:
- A league must always have at least one active membership with `role: 'admin'`. The Super Admin demotion endpoint refuses to leave a league with zero admins (see Edge Cases in `spec.md`).
- `userAccountId` may be null at migration time only; setting it is a one-way operation done either by an Invitation acceptance or a League Admin attaching an email to the membership.

**State Transitions**:

```
role: member ↔ admin   (Super Admin or another League Admin promotes/demotes)
isActive: true → false (League Admin deactivates) → true (League Admin reinstates)
{any} → deleted        (League Admin removes; cascade-related: AuditEvent retains a snapshot reference but FK is nullified)
```

---

### SuperAdmin

A platform-level role. Independent of any league.

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | cuid |
| `userAccountId` | string | Foreign key to UserAccount |
| `grantedAt` | datetime | When granted |
| `grantedByUserAccountId` | string \| null | Another Super Admin who granted, or null if bootstrapped from env |
| `revokedAt` | datetime \| null | If revoked, when (kept for audit; row not deleted) |
| `revokedByUserAccountId` | string \| null | Revoker |

**Indexes**: unique `(userAccountId)` where revokedAt is null — a user can hold the role at most once at any time.

---

### MagicLinkToken

A single-use, time-limited token used for sign-in or invitation acceptance. Plaintext is delivered via email exactly once; only the SHA-256 hash is stored.

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | cuid |
| `tokenHash` | string | SHA-256 of the random 32-byte token (hex-encoded) |
| `purpose` | enum | `sign_in` \| `invitation` |
| `userAccountId` | string \| null | Target account for sign-in tokens; for invitation tokens, populated only after acceptance creates the account |
| `email` | string | Email the token was issued to (binds the link to a recipient) |
| `invitationId` | string \| null | If purpose=invitation, foreign key to Invitation |
| `expiresAt` | datetime | Issued-at + 15 min (sign-in) or + 7 days (invitation) |
| `usedAt` | datetime \| null | Set on first successful verify; subsequent verifies fail |
| `createdAt` | datetime | Issuance time |
| `createdFromIp` | string \| null | IP of the requester (for abuse triage) |

**Indexes**:
- unique `(tokenHash)`
- index `(email, purpose)` — used to invalidate prior unused sign-in tokens when issuing a new one
- index `(expiresAt)` — for periodic cleanup

**Constraints**:
- Periodic cleanup job removes rows where `usedAt` or `expiresAt` is older than 30 days.

---

### Session

A server-side session created on successful magic-link verification.

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | cuid |
| `tokenHash` | string | SHA-256 of the random session token (hex) |
| `userAccountId` | string | Foreign key to UserAccount |
| `expiresAt` | datetime | createdAt + 30 days; bumped via sliding-window refresh |
| `lastSeenAt` | datetime | Updated on each authenticated request more than 1h after previous lastSeenAt |
| `createdAt` | datetime | When the session was created |
| `userAgent` | string \| null | Browser UA (for user-visible "your sessions" list) |
| `ip` | string \| null | First-seen IP (truncated; for abuse triage) |
| `revokedAt` | datetime \| null | Server-side revocation marker |

**Indexes**:
- unique `(tokenHash)`
- index `(userAccountId, revokedAt)` — list user's sessions, bulk revoke

---

### Invitation

A pending invitation issued by a League Admin (or Super Admin) to a specific email for a specific league.

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | cuid |
| `leagueId` | string | Target league |
| `email` | string | Lowercased target address |
| `role` | enum | `member` \| `admin` (the role the recipient gets on acceptance) |
| `managerId` | int \| null | Optional pre-supplied FPL Manager ID; if null, the recipient supplies on acceptance |
| `displayName` | string \| null | Optional pre-supplied display name |
| `invitedByUserAccountId` | string | Who issued the invitation |
| `tokenId` | string | Foreign key to the MagicLinkToken (purpose=invitation) generated for delivery |
| `acceptedAt` | datetime \| null | When the recipient accepted |
| `revokedAt` | datetime \| null | If the inviter cancelled before acceptance |
| `createdAt` | datetime | Issuance |

**Indexes**:
- index `(leagueId, acceptedAt)` — list pending invites in a league
- unique `(leagueId, email, acceptedAt is null)` (pseudo — application-level: prevents duplicate active pending invites)

**State Transitions**:

```
pending  → accepted (recipient clicks link, supplies any missing fields, LeagueMembership created)
pending  → revoked  (inviter cancels)
pending  → expired  (token expires; surfaced as "expired" in the UI; can be re-issued)
```

---

### AuditEvent

Records administrative actions for FR-027 / FR-028.

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | cuid |
| `leagueId` | string \| null | League the action targets; null for platform-level actions (e.g., grant Super Admin) |
| `actorUserAccountId` | string \| null | Who performed the action; null for `actor=migration`, `actor=system` |
| `actorKind` | enum | `user` \| `migration` \| `system` |
| `action` | string | Stable verb identifier (see catalog below) |
| `targetKind` | enum | `league` \| `membership` \| `user_account` \| `invitation` \| `super_admin` \| `session` |
| `targetId` | string \| null | ID of the target |
| `details` | json | Free-form structured payload describing the change (before/after, metadata) |
| `createdAt` | datetime | Event time |
| `requestIp` | string \| null | For platform-level audit |

**Indexes**:
- index `(leagueId, createdAt desc)` — League Admin audit feed
- index `(createdAt desc)` — Super Admin platform-wide feed
- index `(actorUserAccountId, createdAt desc)` — "what has this actor done"

**Action catalog (initial)**:

| action | targetKind | Notes |
|--------|------------|-------|
| `league.created` | league | |
| `league.updated` | league | details: changed fields |
| `league.suspended` | league | details: reason |
| `league.reinstated` | league | |
| `league.deleted` | league | terminal |
| `membership.added` | membership | source recorded |
| `membership.role_changed` | membership | details: from/to |
| `membership.deactivated` | membership | |
| `membership.reactivated` | membership | |
| `membership.removed` | membership | terminal |
| `invitation.issued` | invitation | |
| `invitation.accepted` | invitation | |
| `invitation.revoked` | invitation | |
| `super_admin.granted` | super_admin | |
| `super_admin.revoked` | super_admin | |
| `user_account.disabled` | user_account | |
| `user_account.enabled` | user_account | |
| `session.revoked` | session | by admin or self |
| `migration.completed` | league | actorKind=migration |

---

## Entity Relationships

```
Platform (singleton)
  └─ has many SuperAdmin assignments

UserAccount (one per email)
  ├─ has 0..N LeagueMemberships (one per league joined)
  ├─ has 0..1 SuperAdmin (active assignment)
  ├─ has 0..N Sessions
  ├─ has 0..N MagicLinkTokens (sign_in)
  └─ may have issued/received Invitations

League
  ├─ belongs to Platform implicitly (no FK; singleton platform)
  ├─ has many LeagueMemberships
  ├─ has many Invitations (pending or historical)
  ├─ has many AuditEvents
  └─ has many LeagueSlugHistory rows

LeagueMembership
  ├─ belongs to League
  └─ belongs to UserAccount (nullable for unmigrated members without email)

Invitation
  ├─ belongs to League
  ├─ refers to MagicLinkToken (purpose=invitation)
  └─ produces a LeagueMembership on acceptance

MagicLinkToken
  └─ may reference UserAccount (sign_in) or Invitation (invitation)

Session
  └─ belongs to UserAccount

SuperAdmin
  └─ belongs to UserAccount

AuditEvent
  ├─ optionally belongs to League (null = platform-level)
  └─ optionally references actor UserAccount
```

FPL-derived entities (Gameweek, Player, Squad, Fixture, Chip, Suggestion) carry over unchanged but every query path is now reached through a `LeagueMembership` (or Super Admin override), so the data they produce is naturally scoped.

---

## Migration: Current Schema → New Schema

Source schema (current `prisma/schema.prisma`):

```prisma
model Organisation { id, name, miniLeagueId, digestPrompt, digestCacheGw, digestCacheJson, createdAt, members[] }
model Member       { id, managerId, displayName, teamName, source, isActive, pointsDeductionPerGw, email,
                     addedAt, organisationId, organisation, user }
model User         { id, managerId (PK), passwordHash, createdAt, lastLoginAt, member }
```

Mapping:

| Old | New |
|-----|-----|
| `Organisation` (1 row) | `League` (1 row, slug auto-generated from name) + `Platform` row |
| `Organisation.miniLeagueId` | `League.miniLeagueId` |
| `Organisation.digest*` | `League.digest*` |
| `Member` (N rows) | `LeagueMembership` (N rows, role=`member` for all by default) |
| `Member.organisationId` | `LeagueMembership.leagueId` |
| `Member.email` | `UserAccount.email` (one new UserAccount per non-null email) |
| `User.passwordHash` | dropped (no successor) |
| `User.managerId` | the corresponding `LeagueMembership.managerId` already holds this |
| `User.lastLoginAt` | `UserAccount.lastLoginAt` (preserved per user where derivable) |

Bootstrap actions during migration:

1. `BOOTSTRAP_SUPER_ADMIN_EMAIL` (env) → ensure UserAccount + active SuperAdmin row.
2. `BOOTSTRAP_LEAGUE_ADMIN_EMAIL` (env) → upgrade that user's LeagueMembership in the migrated league to `role: 'admin'`.
3. If `BOOTSTRAP_LEAGUE_ADMIN_EMAIL` is unset and no LeagueMembership has role=admin after step 2, the migration aborts with a clear error — a league cannot exist without an admin (per the constraint above).

---

## Validation Rules (Zod schemas to be defined in `lib/validation/`)

| Object | Key constraints |
|--------|-----------------|
| `LeagueCreateInput` | name 1–80; slug 1–60 lowercase + hyphens (auto-generated if omitted); miniLeagueId optional positive int; logoUrl optional URL |
| `LeagueUpdateInput` | partial of create; slug change creates LeagueSlugHistory row |
| `MembershipAddInput` | managerId required positive int; displayName optional 1–60; email optional valid email |
| `MembershipUpdateInput` | partial; role change requires admin role on actor |
| `InvitationCreateInput` | email required valid; role in {member, admin}; managerId optional positive int |
| `MagicLinkRequestInput` | email required valid; rate-limited |
| `RoleChangeInput` | role in {member, admin}; refuses if it would leave league with zero admins |

---

## Local Persistence Scope

In addition to the existing scope (Organisation + Member, now League + LeagueMembership + UserAccount), the new schema adds **eight** new tables: Platform, LeagueSlugHistory, SuperAdmin, MagicLinkToken, Session, Invitation, AuditEvent. All FPL-sourced data remains transient/cached at the request layer — the multi-tenant change does not introduce new caching state.

The schema continues to fit a single SQLite file. Indexes are sized to the v1 target (50 leagues × 50 members ≈ 2,500 LeagueMemberships, ~50,000 audit events/year at the upper bound).
