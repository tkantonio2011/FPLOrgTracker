# Phase 0 — Research: Public sign-up for League Admins

**Feature**: 005-public-signup
**Date**: 2026-05-22

Every Technical Context unknown from `plan.md` is resolved here. Each decision names what was chosen, why, and what was rejected.

---

## R1 — Carrying the desired league details from form-submit to magic-link-click

**Decision**: Store the desired league display name and FPL mini-league ID as a JSON-encoded payload on the `MagicLinkToken` row issued at form submission. A new nullable column `self_signup_payload TEXT` on `magic_link_tokens` holds it. The column is populated only when `purpose = "self_signup"`; null otherwise.

**Rationale**:
- The token already lives in the DB and is the single source of truth for the in-flight sign-up (its TTL is the lifetime of the in-flight signup).
- A JSON column matches SQLite's storage model and the existing `League.digestCacheJson` pattern.
- Reading the payload at click time is a single `findUnique` already happening to verify the token — no extra query.
- Encrypting the payload would be overkill: it's not a secret (the data is what the user just typed), and the token is single-use anyway.

**Alternatives considered**:
- A separate `PendingSignup` table joined by token id. Rejected: a 1:1 join for data that has the exact same lifetime as the token is unnecessary complexity.
- Storing the payload in a server-side in-memory map keyed by token. Rejected: a magic-link click on a different device than the form submission would lose the payload.
- Encoding the payload into the token plaintext itself (JWT-style). Rejected: not a proven need; the existing `MagicLinkToken` is a random opaque token with a server-side state row — switching to JWT-shape for one purpose would diverge from the rest of the auth surface.

**Validation**: Zod schema `selfSignupPayloadSchema = z.object({ leagueName: nameSchema, miniLeagueId: z.number().int().positive(), fplVerifiedAt: z.string().datetime().nullable() })` at parse time. Malformed JSON or schema mismatch ⇒ token is treated as `invalid` (same as a tampered token).

---

## R2 — FPL mini-league verification helper

**Decision**: Add `src/lib/fpl/verify-mini-league.ts` exposing one function `verifyFplMiniLeague(id: number, opts?: { timeoutMs?: number }): Promise<VerifyResult>` where:

```ts
type VerifyResult =
  | { kind: "verified"; name: string }            // FPL responded; league exists
  | { kind: "no_such_league" }                    // FPL responded 404
  | { kind: "inconclusive"; reason: "timeout" | "network" | "malformed" };
```

Default `timeoutMs = 3000`. The function uses the existing `fetchLeagueStandings(leagueId, page=1)` helper from `src/lib/fpl/client.ts` wrapped in an `AbortController` so the 3-second budget is enforced.

**Rationale**:
- Single result type forces every caller to handle every branch — no boolean / null collapse.
- 3-second timeout matches FR-021b in the spec and is consistent with the existing FPL client which uses 8-second default elsewhere (sign-up's user-facing constraint is tighter).
- Treating "anything that isn't a definitive 404 or a successful response" as `inconclusive` is conservative: we never accidentally reject a real league because FPL had a hiccup.

**Alternatives considered**:
- Booleans `(exists | null)`. Rejected: callers would lose the timeout / network distinction needed for FR-021a.
- A long-polling background verifier kicked off at form submit. Rejected: too much machinery for the 3-second budget.

**Validation**: Vitest unit tests for each branch using a mocked `fetch`. Network error injected via `fetch.mockRejectedValue(new TypeError("...")) `, timeout via a never-resolving `fetch` mock + fake timers.

---

## R3 — Self-signup token issuance and consumption

**Decision**: Extend `src/lib/auth/magic-link.ts` with two new functions:

```ts
issueSelfSignupToken(
  email: string,
  payload: SelfSignupPayload,
  ip: string | null,
): Promise<IssuedToken>

consumeSelfSignupToken(plaintext: string): Promise<
  | { ok: true; tokenId: string; email: string; payload: SelfSignupPayload }
  | { ok: false; reason: "invalid" | "expired" | "used" | "malformed" }
>
```

Token TTL is **15 minutes**, matching the existing sign-in token TTL. Storage uses the same `db.magicLinkToken.create({...})` with `purpose: "self_signup"`, `self_signup_payload: JSON.stringify(payload)`, `email`, `expiresAt`. Consumption uses the existing atomic `updateMany({ where: { id, usedAt: null }, data: { usedAt: new Date() } })` pattern — racing clicks resolve at the database level.

**Rationale**:
- Reuses every existing primitive (random plaintext, SHA-256 hash, atomic update). No new crypto.
- Matches the existing `consumeToken` signature so the verify route's branching is shaped identically.
- 15-minute TTL is long enough for a typical "open inbox, click link" cycle but short enough that an abandoned sign-up disappears quickly.

**Alternatives considered**:
- Longer TTL (7 days, matching invitations). Rejected: a sign-up is an immediate act; a 7-day window invites stale-token confusion.
- Issuing the token at the moment the user types their email (auto-submit). Rejected: too aggressive; users want a "Sign up" button to feel like a deliberate action.

---

## R4 — Slug allocation shared across creation paths

**Decision**: Move the existing `slugify` and `resolveAvailableSlug` helpers from `src/app/api/platform/leagues/route.ts` to a new `src/lib/signup/slug.ts`. The Super Admin path, the self-signup path, and the "create another league" path all import from the new module. No behaviour change for the existing Super Admin path; the helpers just live in a more obviously-shared location.

**Rationale**:
- DRY — the same auto-suffix algorithm and history-check should not be duplicated three ways.
- The existing helpers already check both `League.slug` and `LeagueSlugHistory.slug` (so a renamed-away slug doesn't collide). Reuse preserves that property.
- Naming the new module `signup/slug.ts` is reasonable because public signup is the path that most needs the auto-suffix; the existing platform path also benefits.

**Alternatives considered**:
- Inline a separate copy in each path. Rejected: violates the "many small files but no duplication" principle.
- Move the helpers to `src/lib/league/` (a more generic location). Rejected: there's no existing `src/lib/league/` namespace and creating one for two helpers is over-structuring; the signup module is fine.

---

## R5 — Rate limiting integration

**Decision**: Sign-up form submissions go through the existing `checkSignInRateLimit(email, ip)` function in `src/lib/auth/magic-link.ts`. **No new rate-limit buckets are introduced.** A 6th attempt within 60 s from the same email shares the same bucket as the 6th sign-in attempt from that email — same with the per-IP cap.

**Rationale**:
- Per Q4 clarification (5/min/email, 30/hr/email, 20/min/IP). Reusing the existing function is literally one import line in the new route.
- An attacker who is rate-limited on sign-up shouldn't be able to bypass by switching to sign-in (same email) — sharing buckets enforces that.
- The existing buckets already have unit-test coverage; no new test surface for the rate limiter itself.

**Trade-off the spec accepts**: A legitimate user who has been signing in heavily (e.g. during a debugging session) could find their first sign-up attempt rate-limited. Negligible in practice at the platform's scale (< 50 sign-ups / day, single-digit testers on UAT).

**Alternatives considered**:
- Separate sign-up buckets with stricter thresholds. Rejected per Q4.
- Per-day per-IP cap on top of per-minute caps. Rejected per Q4; the existing buckets are enough.

---

## R6 — Email path for "you already have an account" submissions

**Decision**: When a sign-up form is submitted with an email that already has a `UserAccount`, the route handler issues a **normal sign-in magic-link** (purpose = `"sign_in"`) using the existing `issueSignInToken` and `sendMagicLink` — not a self-signup token. The email body is the regular sign-in email, not a "we noticed you tried to sign up" message (which would leak account existence).

**Rationale**:
- Preserves FR-007 (no new league for an existing email).
- Preserves FR-013 (same response shape — `{ sent: true }` — for any non-error path).
- The recipient gets a useful link (they can sign in) rather than a dead-end "you already have an account" notification.
- Doesn't leak account existence because the same generic email never reveals which flow triggered it.

**Alternatives considered**:
- Silent drop. Rejected: hostile to legitimate users who forgot they had an account.
- Differentiated email body ("welcome back!"). Rejected: enumeration leak.
- Bounce the request with HTTP 409. Rejected: enumeration leak (different response shape from new-signup case).

---

## R7 — Verify route extension

**Decision**: Extend `src/app/api/auth/verify/route.ts` to handle the new `peek.purpose === "self_signup"` case. The flow:

1. Peek the token (existing).
2. If purpose is `self_signup`, consume the token atomically via `consumeSelfSignupToken`.
3. Open a single Prisma transaction:
   1. Re-check the `UserAccount.email` uniqueness (someone could have signed up with the same email and clicked first).
   2. Re-check the `League.miniLeagueId` uniqueness (the race condition documented in FR-011b).
   3. If either check fails, abort the transaction and redirect to `/verify?error=conflict` with a clear explanation (different from `invalid`/`used`/`expired`).
   4. Otherwise: create `UserAccount`, create `League` (with slug allocated via `resolveAvailableSlug` and `createdByUserAccountId` set to the new user), create `LeagueMembership` (role=admin, source="self_signup"), write an `AuditEvent` (action=`league.created.self_signup`).
   5. Create a `Session` for the new user and set the session cookie.
4. Redirect to `/l/<new-slug>/admin/settings`.

**Rationale**:
- Atomicity is enforced by the Prisma transaction. A crash mid-way leaves no rows.
- Re-checking uniqueness inside the transaction handles the cross-token race documented in the spec.
- Reuses the existing session-creation helper from `src/lib/auth/session.ts`.

**Alternatives considered**:
- Mutating-update on a pre-existing pending row. Rejected per Q2.
- Pushing the creation logic into a Prisma extension / middleware. Rejected: the logic is one transaction, not a cross-cutting concern.

---

## R8 — Slug for the new league: from where?

**Decision**: The slug is derived from the user's submitted **display name** at click time, via `slugify(name)` + `resolveAvailableSlug(base)`. The display name is preserved verbatim as `League.name`; the slug is the auto-allocated URL-safe version.

**Rationale**:
- Matches the existing Super Admin path's slug behaviour. No surprise for users who later see the platform's slug pattern.
- Allocation happens at click time (not at form submit) so two visitors who type the same display name don't both consume the same base slug.

**Alternatives considered**:
- Letting users enter a slug separately on the form. Rejected: an extra field with no clear user benefit, and inconsistent with the Super Admin form's collision policy.
- Using `<userFirstName>-<random>` as a slug. Rejected: doesn't reflect the league name; harder to remember and share.

---

## R9 — "Create another league" for signed-in users

**Decision**: Add a new POST endpoint `/api/leagues` (signed-in only) that creates a new league on behalf of the calling user, with the user automatically granted `admin` role. The endpoint takes `{ name: string, miniLeagueId: number }` (same shape as the public sign-up form minus the email). FPL verification + slug allocation behave identically to the public path; the only difference is no magic-link round-trip — the league is created synchronously and the response includes the new slug for client-side redirect.

The form lives in a new client component `CreateAnotherLeagueForm.tsx`, mounted at:
1. A new "Create another league" button at the top of `/leagues`.
2. The existing `/my-admin` page also gets a "Create another league" button.

**Rationale**:
- A signed-in user with a confirmed email doesn't need a magic-link round-trip.
- The new `/api/leagues` endpoint is the natural API surface — there's already `/api/platform/leagues` for Super Admin creation and `/api/leagues/[id]/...` for actions on a league; `POST /api/leagues` (signed-in user creates their own) fits the REST pattern.
- Two entry points (`/leagues` and `/my-admin`) catches both audiences (member-with-no-admin-leagues-yet and existing admins).

**Alternatives considered**:
- Force signed-in users through the magic-link flow. Rejected per Q2 / SC-007 (< 30 s for a second league).
- Add a CLI for league creation. Rejected: out of scope; the form is the user-visible surface.

---

## R10 — FPL "verified" / "unverified" flag on League

**Decision**: Reuse the existing nullable `League.miniLeagueId` column. When FPL verification is `verified` at sign-up, store the integer. When FPL verification is `inconclusive`, store the integer **and** add a new boolean column `mini_league_unverified` to `leagues` (default `false`). The league settings page reads this column and surfaces a "Verify with FPL" button when true; clicking re-runs `verifyFplMiniLeague` and clears the flag on success.

**Rationale**:
- A nullable `miniLeagueId` already means "no FPL link"; we need to distinguish "linked but unverified" from "verified" so the FR-021a flow is observable.
- Adding one boolean column is cheap and the existing settings page already has admin controls.

**Alternatives considered**:
- A separate `League.fplStatus` enum. Rejected: one boolean is enough.
- Encode unverified state by null'ing the mini-league ID. Rejected: we'd lose the user's input on FPL outage.

---

## R11 — Audit event taxonomy

**Decision**: Add five new audit-event action codes:

| Action | Emitted when | `actorUserAccountId` | `targetKind` / `targetId` |
|---|---|---|---|
| `league.created.self_signup` | A self-signup magic-link click successfully creates a `League` | new user's account id | `league` / new league id |
| `signup.rejected.duplicate_email` | Form submitted with an email that already has a `UserAccount` | null | `user_account` / existing account id |
| `signup.rejected.duplicate_mini_league_id` | Form submitted with a mini-league ID already in `League.miniLeagueId` | null | `league` / existing league id |
| `signup.rejected.rate_limited` | Form submission hits any rate-limit bucket | null | `user_account` / null |
| `signup.rejected.fpl_api_no_such_league` | FPL API returns 404 for the submitted ID | null | null / submitted ID |

For each rejection, the `details` JSON includes the IP, the submitted email (so the Super Admin can audit), and (for rejections) the reason in machine-readable form.

**Rationale**:
- Each rejection is observable in `/platform/audit` so the Super Admin can spot abuse patterns.
- The success event has all the linkage data (actor + target) for normal audit traversal.
- No new audit consumer code needed — existing `/platform/audit` page already renders any action string.

**Alternatives considered**:
- One generic `signup.rejected` with a `reason` field in `details`. Rejected: distinct action codes filter cleanly in the audit UI; the existing UI already does grouping by action.

---

## R12 — Signed-in user accidentally on the public sign-up form

**Decision**: The `/sign-up` page is a server component that reads the session cookie. If a session exists, the page renders a small "You're already signed in — go to /leagues or create another league →" view with two links, not the sign-up form. The form itself is never rendered for a signed-in visitor.

The `POST /api/auth/signup` endpoint additionally checks for a session and returns the same generic response (no token issued) if one is present — defence in depth against a direct API call from a signed-in browser.

**Rationale**:
- A signed-in user clicking a bookmarked `/sign-up` URL gets a clear next step rather than a confusing duplicate-account flow.
- Per the spec edge case "Sign-up while signed in".

**Alternatives considered**:
- Auto-redirect signed-in users from `/sign-up` to `/leagues`. Rejected: explicit links are more informative than a silent redirect.

---

## R13 — Display-name and slug input validation

**Decision**: Reuse the existing `nameSchema` from `src/lib/validation/index.ts` (which enforces non-empty trimmed, max 80 chars, no control characters). For the mini-league ID, use `z.number().int().positive().lt(100_000_000)` to reject obvious nonsense values while accepting every real FPL ID (current IDs are 7-8 digits).

**Rationale**:
- Reuse keeps validation consistent across the platform.
- The upper-bound on mini-league ID protects against `Number.MAX_SAFE_INTEGER` shenanigans without rejecting real IDs.

**Alternatives considered**:
- A profanity filter on the league name. Rejected for v1 — adds dependency and false-positive risk; the Super Admin can rename or suspend offensive leagues via the existing 002 surface.
- Lower max-length (40 chars). Rejected: existing leagues already use up to 80; consistency wins.

---

## R14 — UI: where the "Create another league" button lives

**Decision**: Two mount points, both reachable post-sign-in:

1. **`/leagues` page**: A primary-styled button "Create a new league" at the top of the page, above the league list. Visible to every signed-in user regardless of role.
2. **`/my-admin` page**: A secondary-styled button "Create another league" at the top of the page, above the list of leagues the user administers. Visible only to users with at least one admin membership.

The button on either page navigates to `/leagues/new` (a new tiny page that hosts the `CreateAnotherLeagueForm` client component). On submit, the form POSTs to `/api/leagues`; on success it redirects the browser to `/l/<new-slug>/admin/settings`.

**Rationale**:
- `/leagues` is the natural "I want to do something with leagues" landing page.
- `/my-admin` is where existing admins go; surfacing the button there catches the most-likely audience.
- A dedicated `/leagues/new` page keeps the URL bookmarkable and gives space for a clear, slow form rather than a modal.

**Alternatives considered**:
- A sidebar button in every league shell. Rejected: too prominent; most clicks would be accidental.
- A modal on `/leagues`. Rejected: harder to deep-link to a "you got a validation error" state.

---

## R15 — Page-level dynamics for `/sign-up`

**Decision**: Mark `/sign-up/page.tsx` with `export const dynamic = "force-dynamic"` because the page reads the session cookie to decide what to render (R12). Without this, Next.js would attempt to statically render the page during `next build` and the session check would be evaluated against an empty cookie jar — every visitor would see the "signed-in" branch (or worse, the page would be cached and never re-evaluated).

**Rationale**:
- Same reasoning as the 004 UAT-banner fix: layouts/pages that branch on request-scoped state must be dynamic.
- The page is server-rendered once per visit; the cost is negligible.

**Alternatives considered**:
- Make the page entirely a client component. Rejected: would expose the session-detection logic to the client and require an extra round-trip.

---

## Summary table

| Question | Answer |
|---|---|
| Where do the desired-league fields live between submit and click? | JSON column `magic_link_tokens.self_signup_payload` (R1) |
| How is FPL verified? | New helper with discriminated-union result; 3 s timeout (R2) |
| How is the token issued/consumed? | Two new functions in `magic-link.ts` reusing existing primitives (R3) |
| How is slug allocation shared? | Move to `src/lib/signup/slug.ts` (R4) |
| How is rate-limiting wired? | Reuses existing `checkSignInRateLimit` (R5) |
| What happens for an existing email? | Send a regular sign-in link instead — no leak (R6) |
| How does the verify route handle the new purpose? | New branch + Prisma transaction (R7) |
| Where does the new league's slug come from? | Slugify the display name at click time (R8) |
| How do signed-in users create a second league? | New `POST /api/leagues` + `/leagues/new` page (R9) |
| How do we record FPL-unverified state? | New `mini_league_unverified` boolean on `leagues` (R10) |
| What audit events does the feature emit? | 5 new action codes (R11) |
| What if a signed-in user hits `/sign-up`? | Render a redirect-suggestion view instead of the form (R12) |
| How is input validated? | Reuse `nameSchema`; tight bounds on mini-league ID (R13) |
| Where does the in-app "create another league" form live? | `/leagues/new`, buttons from `/leagues` and `/my-admin` (R14) |
| Why is the sign-up page force-dynamic? | Reads session cookie at render time (R15) |

No NEEDS CLARIFICATION items remain.
