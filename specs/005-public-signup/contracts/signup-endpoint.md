# Contract: `POST /api/auth/signup`

**Feature**: 005-public-signup
**Date**: 2026-05-22

The public sign-up form posts to this endpoint. The endpoint MUST satisfy the spec's enumeration-resistance and abuse-resistance requirements (FR-007 / FR-008 / FR-012 / FR-013).

---

## Request

| Property | Value |
|---|---|
| **Method** | `POST` |
| **Path** | `/api/auth/signup` |
| **Authentication** | Public — no session required |
| **Content-Type** | `application/json` |
| **Runtime** | `nodejs` (Prisma needs Node.js) |
| **Dynamic** | `force-dynamic` |

### Request body

```json
{
  "email": "alice@example.com",
  "leagueName": "The Sunday Crew",
  "miniLeagueId": 12345
}
```

Zod schema (server-side):

```ts
const signupBodySchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  leagueName: nameSchema,                                 // existing — trimmed, 1..80, no control chars
  miniLeagueId: z.number().int().positive().lt(100_000_000),
});
```

### Headers read

- `x-forwarded-for` / `x-real-ip` → `ip` for rate-limit accounting and audit event.

---

## Response — generic success / no-op

`200 OK` with body:

```json
{ "success": true, "data": { "sent": true } }
```

This response is returned for **every** non-error path:
- Successful submission for a brand-new email + verified FPL league (token issued, email sent).
- Successful submission for a brand-new email + FPL inconclusive (token issued with `fplVerifiedAt: null`, email sent).
- Submission for an email that already has a `UserAccount` (sign-in token issued + sign-in email sent, no new league).
- Submission rate-limited (no token issued, no email sent).
- Submission while signed in (no token issued, no email sent — defence in depth).

The client cannot distinguish these cases by response body or HTTP status. Per FR-013, this is intentional.

---

## Response — differentiated errors

The endpoint differentiates **only** in cases that don't enable enumeration:

| HTTP | Body | When |
|---|---|---|
| `400 Bad Request` | `{ success: false, error: "Validation failed: ..." }` | Zod validation fails (malformed email, empty league name, mini-league ID not a positive integer). |
| `400 Bad Request` | `{ success: false, error: "No FPL mini-league with that ID exists. Please check the number." }` | FPL API confirms 404. Per FR-021. |
| `409 Conflict` | `{ success: false, error: "This FPL mini-league is already tracked. If you should be its admin, contact support." }` | The submitted `miniLeagueId` already exists in `League.miniLeagueId`. Per FR-008. |
| `500 Internal Server Error` | `{ success: false, error: "Internal server error" }` | Any uncaught exception (DB unreachable, etc). The client gets a generic message; details land in the server log. |

Rationale for differentiating FPL-404 and duplicate-mini-league-ID despite the enumeration concern:
- These two are about a user-supplied resource the public can verify themselves (mini-league existence is public on FPL; mini-league ownership the existing user can ask about).
- Hiding them as silent no-ops would create dead-end UX (user types a wrong number, never knows why no email arrives).

---

## Handler logic (in plain text, not pseudocode)

1. Parse the body against `signupBodySchema`. On failure: return 400 with the validation message.
2. **Reject if signed-in**: read the session cookie; if a valid session resolves, return the generic 200 `{sent: true}` without taking further action. Per R12.
3. Run `checkSignInRateLimit(body.email, ip)`. If the bucket is exceeded: return the generic 200 `{sent: true}` without taking further action. Audit event `signup.rejected.rate_limited`.
4. Look up `db.userAccount.findUnique({ where: { email: body.email } })`. If a non-disabled account exists:
   - Call `issueSignInToken` and `sendMagicLink` for that account (per R6).
   - Audit event `signup.rejected.duplicate_email`.
   - Return the generic 200 `{sent: true}`.
5. Verify the FPL mini-league ID via `verifyFplMiniLeague(body.miniLeagueId)`. Three branches:
   - `kind: "no_such_league"` → audit `signup.rejected.fpl_api_no_such_league`, return `400` with the inline error.
   - `kind: "inconclusive"` → continue (FPL outage tolerated per FR-021a).
   - `kind: "verified"` → continue.
6. Check `db.league.findUnique({ where: { miniLeagueId: body.miniLeagueId } })`. If a league already claims it: audit `signup.rejected.duplicate_mini_league_id`, return `409`. (Note: a stricter race-safe check happens again inside the token-consume transaction per R7.)
7. Build `payload: SelfSignupPayload` with `fplVerifiedAt` = `verifyResult.kind === "verified" ? new Date().toISOString() : null`.
8. Call `issueSelfSignupToken(body.email, payload, ip)`. Returns `{ plaintext, tokenId, expiresAt }`.
9. Fire-and-forget `sendMagicLink(body.email, link)` where `link = ${appOrigin(req)}/api/auth/verify?token=${plaintext}`.
10. Return the generic 200 `{sent: true}`.

The handler is wrapped in `try { ... } catch (err) { return failFromError(err); }` so any uncaught exception produces a 500 with no PII leak.

---

## Contract tests (Vitest)

Each test mocks `db`, `verifyFplMiniLeague`, `sendMagicLink`, and `issueSelfSignupToken` and asserts:

1. **Happy path (new email, verified FPL)** — returns 200 `{sent: true}`; one `issueSelfSignupToken` call; one `sendMagicLink` call; payload `.fplVerifiedAt` is a non-null ISO string.
2. **FPL inconclusive (timeout)** — returns 200 `{sent: true}`; payload `.fplVerifiedAt` is `null`.
3. **FPL 404** — returns 400 with the inline error; **zero** `issueSelfSignupToken` calls; **zero** `sendMagicLink` calls; one `signup.rejected.fpl_api_no_such_league` audit call.
4. **Existing email** — returns 200 `{sent: true}`; **zero** self-signup-token calls; **one** sign-in-token call; **one** `sendMagicLink` call; one `signup.rejected.duplicate_email` audit call.
5. **Duplicate mini-league ID** — returns 409 with the inline error; **zero** token calls; **zero** email calls; one audit call.
6. **Rate-limited** — returns 200 `{sent: true}`; **zero** token calls; **zero** email calls.
7. **Already signed in** — returns 200 `{sent: true}`; **zero** token calls; **zero** email calls (defence in depth).
8. **Validation failure** — returns 400 with the Zod issue path in the message; **zero** token / email calls.

---

## Security contract (binding)

- The handler MUST NOT include the submitted email in the success-path response body or in any header (defence against reflected-XSS via crafted email inputs).
- The handler MUST NOT log the magic-link plaintext to any log destination. Only the SHA-256 hash lives in the DB.
- The handler MUST normalise the email via `trim().toLowerCase()` before *every* downstream call (DB lookup, rate-limit, token issuance) to prevent case-aliasing attacks.
- The handler MUST treat any uncaught Prisma exception as a 500 with body `{ success: false, error: "Internal server error" }`. Stack traces never reach the client.
