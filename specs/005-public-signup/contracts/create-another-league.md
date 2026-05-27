# Contract: `POST /api/leagues` (signed-in "create another league")

**Feature**: 005-public-signup
**Date**: 2026-05-22

A new POST endpoint for signed-in users to create additional leagues without a magic-link round-trip. Per R9 and User Story 2.

---

## Request

| Property | Value |
|---|---|
| **Method** | `POST` |
| **Path** | `/api/leagues` |
| **Authentication** | Required (existing session cookie via `requireSession`) |
| **Content-Type** | `application/json` |
| **Runtime** | `nodejs` |
| **Dynamic** | `force-dynamic` |

### Request body

```json
{
  "leagueName": "The Tuesday Crew",
  "miniLeagueId": 67890
}
```

Zod schema:

```ts
const createAnotherLeagueSchema = z.object({
  leagueName: nameSchema,
  miniLeagueId: z.number().int().positive().lt(100_000_000),
});
```

---

## Response — success

```json
{
  "success": true,
  "data": {
    "leagueId": "ckxxx...",
    "slug": "the-tuesday-crew",
    "redirectTo": "/l/the-tuesday-crew/admin/settings"
  }
}
```

HTTP `201 Created`. The client uses `redirectTo` to navigate.

---

## Response — differentiated errors

| HTTP | Body | When |
|---|---|---|
| `400` | `{success:false, error:"Validation failed: ..."}` | Zod validation fails. |
| `400` | `{success:false, error:"No FPL mini-league with that ID exists. Please check the number."}` | FPL API confirms 404. |
| `401` | `{success:false, error:"Sign in required"}` | No session cookie (handled by `requireSession`). |
| `409` | `{success:false, error:"This FPL mini-league is already tracked. If you should be its admin, contact support."}` | Duplicate `miniLeagueId`. |
| `500` | `{success:false, error:"Internal server error"}` | Uncaught exception. |

---

## Handler logic

1. `requireSession(req)` → returns the signed-in `user`. On failure: throws `NotAuthorisedError` → caught by `failFromError` → 401.
2. Parse the body against `createAnotherLeagueSchema`.
3. Verify the FPL mini-league via `verifyFplMiniLeague(body.miniLeagueId)` (3s timeout). Same three branches as the public path:
   - `no_such_league` → return 400 with the inline message.
   - `inconclusive` → continue; the resulting league will have `miniLeagueUnverified = true`.
   - `verified` → continue.
4. Check `db.league.findUnique({ where: { miniLeagueId } })`. If exists: return 409.
5. Open Prisma transaction:
   - `slugify(name)` → base slug.
   - `resolveAvailableSlug(base)` → final slug.
   - `db.league.create` with `name`, `slug`, `miniLeagueId`, `miniLeagueUnverified`, `createdByUserAccountId = user.userAccount.id`.
   - `db.leagueMembership.create` with `leagueId`, `userAccountId = user.userAccount.id`, `managerId = 0` (placeholder until FPL sync populates it), `role = "admin"`, `source = "self_signup"`.
   - `db.auditEvent.create` with `leagueId`, `actorUserAccountId = user.userAccount.id`, `action = "league.created.self_signup"`, `targetKind = "league"`, `targetId = leagueId`, `details = { source: "signed_in_form", fplVerified: !inconclusive }`.
6. Return 201 with `redirectTo`.

The transaction's atomicity guarantees that if step 5b fails (e.g., a race on `miniLeagueId` lost), step 5a is rolled back and no `League` row leaks.

---

## Why no magic-link

The user is already authenticated — they hold a valid session cookie. Re-verifying their email would be ceremony for no benefit. The post-creation redirect to `/l/<slug>/admin/settings` is the same destination the magic-link click would land them at.

---

## Test surface (Vitest integration)

`tests/integration/signup/create-another-league.test.ts`:

1. Happy path: signed-in user creates a second league → 201 with the right slug; new `League`, `LeagueMembership` (role=admin), and `AuditEvent` rows exist; user is admin on both their original and the new league.
2. No session → 401.
3. FPL 404 → 400 with the inline message; no DB rows written.
4. Duplicate mini-league ID → 409; no DB rows written.
5. Validation failure (empty name) → 400.
6. FPL inconclusive (timeout mocked) → 201 with `miniLeagueUnverified = true` on the new league.
7. Slug collision: a user creates a league with the same name as an existing one → the new league gets `<base>-2` and is reachable.
