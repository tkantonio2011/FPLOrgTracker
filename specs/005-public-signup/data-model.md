# Phase 1 — Data Model: Public sign-up for League Admins

**Feature**: 005-public-signup
**Date**: 2026-05-22

This feature reuses the existing schema with **one additive Prisma migration**. No tables are introduced; two columns are added.

---

## Schema diff

```prisma
model MagicLinkToken {
  // ...existing fields unchanged...
  purpose            String   // existing — now also accepts "self_signup" by convention
  selfSignupPayload  String?  @map("self_signup_payload")  // NEW: JSON-encoded SelfSignupPayload, null for non-signup tokens
  // ...
}

model League {
  // ...existing fields unchanged...
  miniLeagueUnverified Boolean  @default(false) @map("mini_league_unverified")  // NEW
  // ...
}
```

`magic_link_tokens.self_signup_payload`:
- Nullable; only populated when `purpose = "self_signup"`.
- Stores the desired league display name and FPL mini-league ID until the magic-link is clicked.
- Garbage-collected with the existing magic-link cleanup process (rows past `expiresAt`).

`leagues.mini_league_unverified`:
- Defaults to `false`. A new league created with a successfully-verified FPL ID is `false`. A new league created when FPL verification was inconclusive (timeout / network error at sign-up) is `true`.
- The league settings page reads this flag and exposes a "Verify with FPL" button when true. Clicking re-runs the verifier and clears the flag on success.

**Migration**: `prisma/migrations/005_self_signup/migration.sql` adds the two columns. No data backfill needed — both columns are nullable / default-false.

---

## Configuration model 1 — `SelfSignupPayload`

In-memory typed object; serialised to JSON for storage in `magic_link_tokens.self_signup_payload`.

| Field | Type | Source | Validation | Notes |
|---|---|---|---|---|
| `leagueName` | `string` | user-submitted | `nameSchema` (existing): trimmed, 1..80, no control chars | The verbatim string the user typed; preserved as `League.name` on creation. |
| `miniLeagueId` | `number` (integer) | user-submitted | `z.number().int().positive().lt(100_000_000)` | The FPL mini-league ID. |
| `fplVerifiedAt` | `string \| null` (ISO-8601 datetime) | server-derived | `z.string().datetime().nullable()` | Timestamp when FPL verification succeeded at form submission. `null` when verification was inconclusive (used to set `League.miniLeagueUnverified = true`). |

**Identity**: One payload per `MagicLinkToken` row of purpose `self_signup`. No standalone identity.

**Lifecycle**:
- Created when `issueSelfSignupToken` runs at form submission. Serialised to JSON and stored on the row.
- Read when the magic-link click consumes the token. Deserialised + Zod-validated on every read.
- A token that survives a schema change (unlikely since both columns are additive) and fails Zod validation is treated as `invalid` — same UX as a tampered token.

**Invariants**:
- If `fplVerifiedAt` is `null`, the future `League.miniLeagueUnverified` MUST be `true`.
- If `fplVerifiedAt` is a string, it MUST parse as ISO-8601 and the `League.miniLeagueUnverified` MUST be `false`.

---

## Existing entities — extended usage

### `MagicLinkToken` (existing, 002)

Now accepts a third value for `purpose`: `"self_signup"` (alongside `"sign_in"` and `"invitation"`).

| `purpose` value | When issued | What it carries | Where consumed |
|---|---|---|---|
| `sign_in` | `/api/auth/magic-link` POST | `userAccountId`, `email` | `/api/auth/verify` GET — sign-in branch |
| `invitation` | `/api/invitations/...` POST | `invitationId`, `email` | `/api/auth/verify` GET — invitation branch |
| `self_signup` | `/api/auth/signup` POST | `email`, `selfSignupPayload` | `/api/auth/verify` GET — self-signup branch (NEW) |

The existing `consumeToken` function in `src/lib/auth/magic-link.ts` is extended to return a new branch `purpose: "self_signup"` carrying the parsed payload. The atomic update-with-where-clause guarantees single-use semantics across all three purposes.

### `UserAccount` (existing, 002)

Now reachable via public sign-up as a **creation path**, in addition to invitation acceptance and bootstrap. No schema change. The created user's `email` is the form-submitted email; `displayName` is null at creation (the user can fill in their profile later from league settings).

### `League` (existing, 002)

Now creatable from outside the Super Admin console. New column `miniLeagueUnverified` (R10) holds the FPL-verification state for self-signup creates. The existing `createdByUserAccountId` is set to the new user's account id.

### `LeagueMembership` (existing, 002)

Now creatable as a side-effect of self-signup. Role is always `admin` for the signup creator. `source` is set to `"self_signup"` (a new value for the existing convention-based enum, extending `"manual"` / `"league"` / `"invitation"`).

### `AuditEvent` (existing, 002)

New action codes per R11 (see `contracts/audit-events.md`).

---

## Sequence: public sign-up form submission → magic-link click → league created

```
Visitor                            Server                           Database              FPL API
─────────────                      ─────────────                    ─────────────         ─────────────
POST /api/auth/signup
  email, name, miniLeagueId
                                   parse + Zod
                                   checkSignInRateLimit
                                   db.userAccount.findUnique  ───▶  (lookup)
                                                                                          (parallel-safe)
                                   if existing account → issueSignInToken (R6)
                                   else:
                                     verifyFplMiniLeague (3s)  ──────────────────────────▶ /api/leagues-classic/<id>/standings
                                                                                          ◀──────  200 (verified) | 404 (no_such)
                                                                                                   | timeout (inconclusive)
                                   if no_such_league → respond {sent:true} (no token)
                                                       audit signup.rejected.fpl_api_no_such_league
                                   else:
                                     payload = { leagueName, miniLeagueId, fplVerifiedAt }
                                     issueSelfSignupToken     ───▶  INSERT magic_link_tokens
                                                                       purpose=self_signup
                                                                       self_signup_payload=JSON(payload)
                                                                       expires_at = now()+15min
                                     sendMagicLink (email)
                                   respond {sent:true} (always)


[ ~minutes later ]


GET /api/auth/verify?token=...
                                   peek MagicLinkToken         ◀──  SELECT by tokenHash
                                   purpose=self_signup → branch
                                   db.$transaction:
                                     re-check email uniqueness
                                     re-check miniLeagueId uniqueness
                                     INSERT user_accounts
                                     resolveAvailableSlug(name)
                                     INSERT leagues             ◀──  with createdByUserAccountId
                                                                     and miniLeagueUnverified=!payload.fplVerifiedAt
                                     INSERT league_memberships  ◀──  role=admin, source=self_signup
                                     INSERT audit_events        ◀──  action=league.created.self_signup
                                     UPDATE magic_link_tokens SET used_at=now()
                                   createSession + setSessionCookie
                                   302 /l/<slug>/admin/settings
```

---

## What this feature does **not** add

- No new model. No new table.
- No new index (the existing `magic_link_tokens(email, purpose)` index already covers self-signup lookups).
- No new foreign-key. The `selfSignupPayload` is a JSON string with no DB-level relationships.
- No new role. The created admin uses `LeagueMembership.role = "admin"` exactly as today.
- No new rate-limit subsystem.
