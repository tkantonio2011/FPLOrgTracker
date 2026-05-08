# Contracts: Authentication & Sessions

**Phase**: 1
**Feature**: 002-multi-league-platform

All endpoints return the standard envelope from the user's TS patterns rule:

```ts
interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  meta?: { total: number; page: number; limit: number };
}
```

All inputs are validated with Zod before the handler runs; validation failures return `{ success: false, error: 'Validation error: <field>: <message>' }` with HTTP 400.

---

## POST /api/auth/magic-link

Request a sign-in magic-link. Always returns the same generic success response regardless of whether the email is registered (anti-enumeration).

**Auth**: none.

**Rate limit**: 5/min and 30/hour per email; 20/min per IP.

**Request body**:
```ts
{
  email: string;       // valid email; lowercased server-side
  redirectTo?: string; // optional same-origin path the user wanted to reach (defaults to '/')
}
```

**Behaviour**:
1. Validate body with Zod.
2. Apply rate limit.
3. If a UserAccount exists for `email`: invalidate any unused sign-in MagicLinkToken for that account, issue a new one (purpose=`sign_in`, expiresAt=+15min), email the link `${origin}/verify?token=${plaintext}&redirect=${redirectTo}` to the user.
4. If no UserAccount: silently no-op (return success) — do not reveal account existence.

**Response 200**:
```ts
{ success: true, data: { sent: true } }
```

**Response 400** (validation): standard envelope.
**Response 429** (rate limited): `{ success: false, error: 'Too many requests' }`.

---

## GET /api/auth/verify

Consume a magic-link token. Issues a session cookie and redirects.

**Auth**: none.

**Query**: `token` (required, opaque string), `redirect` (optional, must be same-origin path).

**Behaviour**:
1. Hash `token` (SHA-256), look up MagicLinkToken by `tokenHash`.
2. If not found, used, or expired → redirect to `/sign-in?error=invalid_or_expired`.
3. If `purpose=sign_in`:
   - Mark token used (`usedAt = now`).
   - Update `UserAccount.lastLoginAt`.
   - Create a Session row, set cookie `session=<plaintext session token>`.
   - Redirect to `redirect` (validated same-origin) or `/`.
4. If `purpose=invitation`:
   - Redirect to `/invitations/${invitationId}` for the recipient to complete acceptance — **do not** consume the token here; it is consumed by the invitation acceptance endpoint after the recipient supplies any missing fields.

**Response**: `302` redirect.

---

## POST /api/auth/logout

Revoke the current session.

**Auth**: required (any signed-in user).

**Request body**: none.

**Behaviour**:
1. Resolve current session via cookie.
2. Set `Session.revokedAt = now`.
3. Clear cookie.
4. Log AuditEvent `session.revoked` (actorKind=user).

**Response 200**: `{ success: true, data: { loggedOut: true } }`.

---

## GET /api/auth/me

Return the current user and their league memberships. Used by client-side auth-aware UI.

**Auth**: required.

**Response 200**:
```ts
{
  success: true,
  data: {
    userAccount: {
      id: string;
      email: string;
      displayName: string | null;
      isSuperAdmin: boolean;
    },
    memberships: Array<{
      leagueId: string;
      leagueSlug: string;
      leagueName: string;
      leagueLogoUrl: string | null;
      leagueStatus: 'active' | 'suspended';
      role: 'member' | 'admin';
      isActive: boolean;
    }>
  }
}
```

**Response 401**: `{ success: false, error: 'Not signed in' }`.

---

## POST /api/invitations

Issue an invitation. League Admins issue for their league; Super Admins for any league.

**Auth**: League Admin of `leagueId` (or Super Admin).

**Request body**:
```ts
{
  leagueId: string;
  email: string;
  role: 'member' | 'admin';
  managerId?: number;
  displayName?: string;
}
```

**Behaviour**:
1. Authorise (League Admin of `leagueId` or Super Admin).
2. Validate body. Reject if email already has an active `LeagueMembership` in this league.
3. Reject if a pending Invitation already exists for `(leagueId, email)`; suggest revoke-and-reissue.
4. Create Invitation row + a MagicLinkToken (purpose=`invitation`, expiresAt=+7 days).
5. Email the recipient: subject "You've been invited to {leagueName}", link `${origin}/invitations/${invitationId}?token=${plaintext}`.
6. Log AuditEvent `invitation.issued`.

**Response 201**:
```ts
{
  success: true,
  data: { invitationId: string; expiresAt: string; }
}
```

**Response 403/409**: standard envelope.

---

## GET /api/invitations/:token

Look up an invitation by its plaintext token (used by the acceptance page to render).

**Auth**: none (the token is the credential).

**Behaviour**: hash token, look up MagicLinkToken (purpose=invitation), follow to Invitation. Return league name, role, and any pre-supplied `managerId`/`displayName`.

**Response 200**:
```ts
{
  success: true,
  data: {
    leagueId: string;
    leagueName: string;
    leagueLogoUrl: string | null;
    role: 'member' | 'admin';
    presuppliedManagerId: number | null;
    presuppliedDisplayName: string | null;
    inviterEmail: string;
    expiresAt: string;
  }
}
```

**Response 410** (expired/used): `{ success: false, error: 'Invitation expired or already used' }`.

---

## POST /api/invitations/:token/accept

Accept an invitation. Creates UserAccount (if none for the invited email), creates LeagueMembership, signs the user in.

**Auth**: none (token is the credential).

**Request body**:
```ts
{
  managerId?: number;     // required if Invitation.managerId is null
  displayName?: string;   // optional override
}
```

**Behaviour**:
1. Resolve invitation via token; reject if expired/used/revoked.
2. Ensure UserAccount exists for `Invitation.email`; create if absent.
3. Create LeagueMembership `{ leagueId, userAccountId, managerId, displayName, role, source: 'invitation', isActive: true }`.
4. Mark MagicLinkToken used and Invitation accepted.
5. Create Session row + set cookie (same path as magic-link sign-in).
6. Log AuditEvent `invitation.accepted` and `membership.added`.

**Response 200**:
```ts
{
  success: true,
  data: {
    leagueSlug: string;
    redirectTo: string; // e.g. /l/{slug}/standings
  }
}
```
