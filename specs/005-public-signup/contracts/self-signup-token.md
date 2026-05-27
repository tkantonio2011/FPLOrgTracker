# Contract: Self-signup `MagicLinkToken` payload

**Feature**: 005-public-signup
**Date**: 2026-05-22

The self-signup flow extends the existing `MagicLinkToken` model with a new `purpose` value and a new payload column. This contract pins the wire format of that payload.

---

## Token row shape (new fields only)

```ts
{
  purpose: "self_signup",                                 // existing column, new convention value
  email: string,                                          // existing — the visitor's email
  userAccountId: null,                                    // existing — null because the account doesn't exist yet
  invitationId: null,                                     // existing — null (not an invitation)
  selfSignupPayload: JSON.stringify(SelfSignupPayload),   // NEW column
}
```

When `purpose === "self_signup"`:
- `userAccountId` MUST be `null` (the account is created later).
- `invitationId` MUST be `null` (this isn't an invitation).
- `selfSignupPayload` MUST contain valid JSON matching the schema below.

When `purpose !== "self_signup"`:
- `selfSignupPayload` MUST be `null`.

---

## `SelfSignupPayload` schema

```ts
import { z } from "zod";
import { nameSchema } from "@/lib/validation";

export const selfSignupPayloadSchema = z.object({
  leagueName: nameSchema,                                  // trimmed, 1..80, no control chars
  miniLeagueId: z.number().int().positive().lt(100_000_000),
  fplVerifiedAt: z.string().datetime().nullable(),
});

export type SelfSignupPayload = z.infer<typeof selfSignupPayloadSchema>;
```

| Field | Type | Notes |
|---|---|---|
| `leagueName` | string | The verbatim string the visitor typed. Used as `League.name` on creation. |
| `miniLeagueId` | positive integer | The FPL mini-league ID. Stored verbatim into `League.miniLeagueId`. |
| `fplVerifiedAt` | ISO datetime string \| null | When non-null: FPL API confirmed the league exists at form-submission time. When null: FPL API was inconclusive — `League.miniLeagueUnverified` will be set to `true`. |

---

## Issuance contract

`issueSelfSignupToken(email, payload, ip)` lives in `src/lib/auth/magic-link.ts`. Behaviour:

1. Validate the `payload` against `selfSignupPayloadSchema`. On failure: throw — the caller (the signup route) is responsible for validating before calling.
2. Generate a 32-byte random plaintext via the existing `generatePlaintextToken()`.
3. SHA-256 the plaintext.
4. Compute `expiresAt = new Date(Date.now() + 15 * 60 * 1000)` (15 min TTL — same as sign-in).
5. `db.magicLinkToken.create({ data: { tokenHash, purpose: "self_signup", email, expiresAt, createdFromIp: ip, selfSignupPayload: JSON.stringify(payload) } })`.
6. Return `{ plaintext, tokenId, expiresAt }`.

**Invariant**: There is no DB-level constraint that prevents two `self_signup` tokens existing simultaneously for the same email. Rate-limiting is enforced at the route layer (R5). When a magic-link click arrives, only the consumed token's payload matters; older unused tokens for the same email simply expire.

---

## Consumption contract

`consumeSelfSignupToken(plaintext)` lives in `src/lib/auth/magic-link.ts`. Behaviour:

1. SHA-256 the plaintext.
2. `db.magicLinkToken.findUnique({ where: { tokenHash } })`. If null: return `{ ok: false, reason: "invalid" }`.
3. If `usedAt != null`: return `{ ok: false, reason: "used" }`.
4. If `expiresAt <= now`: return `{ ok: false, reason: "expired" }`.
5. If `purpose !== "self_signup"`: return `{ ok: false, reason: "invalid" }`. (Defence — the caller is the self-signup branch of the verify route, so this should never happen for valid traffic.)
6. Atomically mark used: `db.magicLinkToken.updateMany({ where: { id, usedAt: null }, data: { usedAt: new Date() } })`. If `count !== 1`: return `{ ok: false, reason: "used" }` (racing click won).
7. Parse `selfSignupPayload` as JSON. If parse fails: return `{ ok: false, reason: "malformed" }`.
8. Validate the parsed object against `selfSignupPayloadSchema`. If invalid: return `{ ok: false, reason: "malformed" }`.
9. Return `{ ok: true, tokenId, email, payload }`.

---

## Garbage collection

The existing magic-link cleanup process (cron'd in production, runnable on demand via the existing operator tooling) deletes any `MagicLinkToken` row where `expiresAt < now - 24h`. No new cleanup is needed — `self_signup` tokens are picked up by the same pass.

---

## Test surface (Vitest)

`tests/unit/signup/token.test.ts`:

1. `issueSelfSignupToken` inserts a row with the right `purpose`, payload, and TTL.
2. `consumeSelfSignupToken` returns `ok: false, reason: "invalid"` for an unknown plaintext.
3. `consumeSelfSignupToken` returns `ok: false, reason: "expired"` for an expired token.
4. `consumeSelfSignupToken` returns `ok: false, reason: "used"` after the first successful consume.
5. `consumeSelfSignupToken` returns `ok: true` with the parsed payload on the happy path.
6. `consumeSelfSignupToken` returns `ok: false, reason: "malformed"` for a row whose `selfSignupPayload` JSON has been tampered with (simulated by directly writing a bad string in the test DB).
7. Two concurrent `consumeSelfSignupToken` calls against the same token: exactly one returns `ok: true`, the other returns `ok: false, reason: "used"`.
