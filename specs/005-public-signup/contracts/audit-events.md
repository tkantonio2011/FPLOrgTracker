# Contract: New audit-event action codes

**Feature**: 005-public-signup
**Date**: 2026-05-22

Five new action codes are added to the existing `AuditEvent.action` taxonomy. The existing `/platform/audit` console renders them without code changes (it groups by action string).

---

## Action codes

| Action | Emitted by | `actorUserAccountId` | `actorKind` | `leagueId` | `targetKind` / `targetId` | `details` (JSON) |
|---|---|---|---|---|---|---|
| `league.created.self_signup` | `/api/auth/verify` (self-signup branch) and `/api/leagues` (signed-in branch) | new user / signed-in user | `user` | the new league's id | `league` / new league id | `{ source: "magic_link" \| "signed_in_form", miniLeagueId, fplVerified: boolean }` |
| `signup.rejected.duplicate_email` | `/api/auth/signup` | `null` (no actor yet) | `system` | `null` | `user_account` / existing account id | `{ email, ip }` |
| `signup.rejected.duplicate_mini_league_id` | `/api/auth/signup` and `/api/leagues` | the actor if signed-in, else `null` | `user` or `system` | `null` | `league` / conflicting existing league id | `{ submittedMiniLeagueId, ip }` |
| `signup.rejected.rate_limited` | `/api/auth/signup` | `null` | `system` | `null` | `null` / `null` | `{ email, ip, bucket: "email_1m" \| "email_1h" \| "ip_1m" }` |
| `signup.rejected.fpl_api_no_such_league` | `/api/auth/signup` and `/api/leagues` | actor if signed-in, else `null` | `user` or `system` | `null` | `null` / `null` | `{ submittedMiniLeagueId, email?, ip }` |

`requestIp` on every event is set from the resolved client IP (existing `x-forwarded-for` / `x-real-ip` logic from `magic-link/route.ts`).

---

## Why these codes (versus one generic `signup.rejected`)

The Super Admin's audit feed at `/platform/audit` already filters by action prefix. Distinct codes give the operator a one-click view of, for example, "all `fpl_api_no_such_league` events in the last week" — useful for spotting a misconfigured client or a typo'd referrer link.

Operationally, the platform owner can use the audit feed to:
- Spot the IP/email behind a `rate_limited` storm (potential abuse pattern).
- Discover that many `duplicate_mini_league_id` events all reference the same existing league (potential ownership dispute).
- Discover that many `fpl_api_no_such_league` events came in within minutes (FPL API may have been down — distinguish from operator concern).

---

## Persistence semantics

- Each audit-event write is best-effort: a failure to log MUST NOT cause the sign-up itself to fail (existing pattern from 002). Logging exceptions are caught and `console.error`'d.
- `details` is `JSON.stringify(...)` per the existing SQLite-no-native-JSON convention.
- The audit event is written **outside** the creation transaction for `league.created.self_signup` — if the transaction rolls back, no audit event is written (no false-positive "league created" record).

---

## Test surface

`tests/integration/signup/audit.test.ts` runs the route handlers end-to-end against the existing in-memory Prisma test DB and asserts:

1. Each of the five action codes is emitted exactly once in the corresponding rejection / success path.
2. `details` is valid JSON, parses cleanly, and contains the expected keys.
3. `requestIp` matches the request's `x-forwarded-for` header in each case.
4. A failed transaction (simulated by injecting a Prisma error on `LeagueMembership.create`) produces **zero** audit events — no orphan record.
