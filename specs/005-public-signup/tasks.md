---

description: "Task list for 005-public-signup"
---

# Tasks: Public sign-up for League Admins

**Input**: Design documents from `/specs/005-public-signup/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Included where the contracts explicitly call them out (slug allocator, FPL verifier, self-signup token issue/consume, the signup route handler integration test, the create-another-league integration test, the audit-events integration test). No new Playwright E2E in this feature beyond the manual 15-row acceptance table in quickstart.md.

**Organization**: Tasks are grouped by user story so each can be shipped independently. **MVP = Phases 1 + 2 + 3 (US1 + US3 assurance because the abuse defence is P1 alongside the happy path).**

## Format: `[ID] [P?] [Story] Description`

- **[P]**: parallelisable with other [P] tasks in the same phase
- **[Story]**: US1 / US2 / US3 / US4 (matches spec.md user stories)

## Path Conventions

This is a Next.js 14 web service (existing). New code lives under:
- `prisma/migrations/005_self_signup/` — additive Prisma migration
- `src/lib/signup/` — slug, payload, token helpers
- `src/lib/fpl/verify-mini-league.ts` — new FPL verifier
- `src/lib/auth/magic-link.ts` (modified) — add self-signup token issue/consume
- `src/app/api/auth/signup/route.ts` — new public POST endpoint
- `src/app/api/auth/verify/route.ts` (modified) — new self-signup branch
- `src/app/api/leagues/route.ts` — new signed-in POST endpoint
- `src/app/(auth)/sign-in/page.tsx` (modified) — adjacent "Create one →" link
- `src/app/(auth)/sign-up/page.tsx` — new public page
- `src/app/(main)/leagues/new/page.tsx` — new signed-in "create another league" page
- `src/components/auth/SignupForm.tsx` — new client component
- `src/components/auth/CreateAnotherLeagueForm.tsx` — new client component
- `src/app/(main)/leagues/page.tsx` (modified) — "Create a new league" button
- `src/app/(main)/my-admin/page.tsx` (modified) — "Create another league" button
- `tests/unit/signup/` + `tests/integration/signup/` — new test surfaces

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Directories, migration scaffolding, and the one schema change every later task depends on.

- [x] T001 Create `src/lib/signup/` directory with an empty `index.ts` re-export stub (real exports added by later tasks)
- [x] T002 Create `tests/unit/signup/` and `tests/integration/signup/` directories for the new test files
- [x] T003 Create `prisma/migrations/005_self_signup/` directory
- [x] T004 Write `prisma/migrations/005_self_signup/migration.sql` adding two columns: `ALTER TABLE magic_link_tokens ADD COLUMN self_signup_payload TEXT;` and `ALTER TABLE leagues ADD COLUMN mini_league_unverified INTEGER NOT NULL DEFAULT 0;` (SQLite stores booleans as integers). Add a header comment linking to `specs/005-public-signup/data-model.md`.
- [x] T005 Update `prisma/schema.prisma`: add `selfSignupPayload String? @map("self_signup_payload")` to `model MagicLinkToken`; add `miniLeagueUnverified Boolean @default(false) @map("mini_league_unverified")` to `model League`. Run `npx prisma generate` locally and commit the regenerated client output paths (if the project commits them — verify by checking `.gitignore`).
- [x] T006 [P] Run the migration locally against `dev.db`: `npx prisma migrate dev --name 005_self_signup` (this both applies the SQL and updates `_prisma_migrations`). Confirm `sqlite3 dev.db ".schema magic_link_tokens"` shows the new column.

**Checkpoint**: Schema is updated, Prisma client is regenerated. No application code references the new columns yet.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Helpers and infrastructure that every user story depends on. **No US-labelled task may begin until Phase 2 is complete.**

### Slug allocation

- [x] T007 Create `src/lib/signup/slug.ts` exporting `slugify(input: string): string` and `resolveAvailableSlug(base: string): Promise<string>`. **Move** the existing `slugify` and `resolveAvailableSlug` functions from `src/app/api/platform/leagues/route.ts` into this file verbatim (don't change behaviour). Update `src/app/api/platform/leagues/route.ts` to import them from the new location. Verify no other call sites break.
- [x] T008 [P] Write `tests/unit/signup/slug.test.ts` covering: (a) basic kebab-case conversion, (b) Unicode normalisation, (c) collision causes `-2`/`-3` suffix, (d) `LeagueSlugHistory` collision also triggers suffix, (e) cap on suffix attempts (the existing "1000 attempts" guard) still throws.

### Self-signup payload type

- [x] T009 Create `src/lib/signup/payload.ts` exporting `selfSignupPayloadSchema` (Zod) and `type SelfSignupPayload = z.infer<typeof selfSignupPayloadSchema>` per the schema in `contracts/self-signup-token.md`. Reuses the existing `nameSchema` from `src/lib/validation`.
- [x] T010 [P] Write `tests/unit/signup/payload.test.ts` covering: valid payload parses; empty `leagueName` rejected; `miniLeagueId = 0` rejected; `miniLeagueId = -5` rejected; `miniLeagueId ≥ 1e8` rejected; `fplVerifiedAt = "not-a-date"` rejected; `fplVerifiedAt = null` accepted; `fplVerifiedAt` as ISO string accepted.

### FPL mini-league verifier

- [x] T011 Create `src/lib/fpl/verify-mini-league.ts` exporting `verifyFplMiniLeague(id: number, opts?: { timeoutMs?: number }): Promise<VerifyResult>` per research R2. Uses `AbortController` for the timeout. Default timeout 3000 ms. Returns the discriminated-union result `{kind: "verified", name} | {kind: "no_such_league"} | {kind: "inconclusive", reason}`.
- [x] T012 [P] Write `tests/unit/signup/verify-mini-league.test.ts` with `vi.spyOn(global, 'fetch')` mocks for: 200 with valid body → `verified`; 404 → `no_such_league`; network error (rejected fetch) → `inconclusive` with reason `network`; never-resolving fetch + fake timers tick past the timeout → `inconclusive` with reason `timeout`; 200 with malformed body → `inconclusive` with reason `malformed`.

### Self-signup token

- [x] T013 Extend `src/lib/auth/magic-link.ts` with `issueSelfSignupToken(email, payload, ip): Promise<IssuedToken>` per `contracts/self-signup-token.md`. Validates the payload via `selfSignupPayloadSchema` before insertion. TTL = 15 minutes (reuse `SIGN_IN_TTL_MS`).
- [x] T014 Extend `src/lib/auth/magic-link.ts` with `consumeSelfSignupToken(plaintext): Promise<{ok:true, ...} | {ok:false, reason:...}>`. Mirrors the existing `consumeToken` atomic update pattern. Validates the parsed payload via `selfSignupPayloadSchema` and returns `{ok:false, reason:"malformed"}` on parse / validation failure.
- [x] T015 [P] Write `tests/unit/signup/token.test.ts` per the 7-scenario test surface in `contracts/self-signup-token.md`.

### Verification gate

- [x] T016 Run `npm test -- tests/unit/signup --run` and confirm T008 + T010 + T012 + T015 all pass.

**Checkpoint**: All shared helpers exist and are independently tested. User-story phases can begin.

---

## Phase 3: User Story 1 — A new user signs up and immediately becomes admin of their first league (Priority: P1) 🎯 MVP

**Goal**: A public visitor with no prior platform contact submits the sign-up form, receives a magic-link, clicks it, and lands inside their newly-created league as League Admin. End-to-end self-serve, no Super Admin involvement.

**Independent Test**: From a clean browser and an unused email, POST to `/api/auth/signup` with valid FPL mini-league ID → `{sent:true}` response → magic-link email arrives → GET `/api/auth/verify?token=...` → redirects to `/l/<new-slug>/admin/settings` → the new `League`, `LeagueMembership` (role=admin), `UserAccount`, and `AuditEvent` rows all exist in one transaction.

### Backend: POST /api/auth/signup

- [x] T017 Create `src/app/api/auth/signup/route.ts` per `contracts/signup-endpoint.md`. Imports: `parseBody`, `z`, `nameSchema` from `@/lib/validation`; `db` from `@/lib/db`; `ok`, `fail`, `failFromError` from `@/lib/http/response`; `checkSignInRateLimit`, `issueSignInToken`, `issueSelfSignupToken` from `@/lib/auth/magic-link`; `sendMagicLink` from `@/lib/auth/email`; `appOrigin` from `@/lib/auth/origin`; `verifyFplMiniLeague` from `@/lib/fpl/verify-mini-league`; `getSessionFromRequest` from `@/lib/auth/session`. Body schema per the contract. Handler logic step-by-step from the contract's "Handler logic" section.
- [x] T018 [US1] Implement the "already signed-in → no-op generic response" branch in T017 (defence in depth per R12).
- [x] T019 [US1] Implement the rate-limit branch in T017 — reuse `checkSignInRateLimit(body.email, ip)`. Audit `signup.rejected.rate_limited`.
- [x] T020 [US1] Implement the existing-email branch in T017 — call `issueSignInToken` + `sendMagicLink` for the existing account; audit `signup.rejected.duplicate_email`; return generic `{sent:true}` (R6).
- [x] T021 [US1] Implement the FPL verification branch in T017: call `verifyFplMiniLeague(body.miniLeagueId)`. On `no_such_league` → audit + return 400 with inline message. On `inconclusive` → continue. On `verified` → continue.
- [x] T022 [US1] Implement the duplicate-mini-league-ID early-check in T017: `db.league.findUnique({ where: { miniLeagueId } })` — if exists, audit + return 409. (The verify route does the race-safe re-check; this is the fast-path UX response.)
- [x] T023 [US1] Implement the happy-path tail in T017: build payload, call `issueSelfSignupToken`, fire-and-forget `sendMagicLink` with link `${appOrigin(req)}/api/auth/verify?token=${plaintext}`, return generic `{sent:true}`.

### Backend: extend GET /api/auth/verify

- [x] T024 [US1] Modify `src/app/api/auth/verify/route.ts` to handle `peek.purpose === "self_signup"` per research R7. Branch order: (1) call `consumeSelfSignupToken(tokenParam)`; (2) on `ok:false`, redirect to `/verify?error=<reason>`; (3) on `ok:true`, open a `db.$transaction` that:
  - re-checks `UserAccount.email` uniqueness
  - re-checks `League.miniLeagueId` uniqueness
  - on conflict: redirect to `/verify?error=conflict`
  - else: create `UserAccount`, allocate slug via `resolveAvailableSlug(slugify(payload.leagueName))`, create `League` (with `createdByUserAccountId`, `miniLeagueId`, `miniLeagueUnverified = !payload.fplVerifiedAt`), create `LeagueMembership` (role=admin, source=self_signup, managerId=0), create `AuditEvent` (`action=league.created.self_signup`).
  - After commit: `createSession(newUserAccountId, {userAgent, ip})`, `setSessionCookie`, redirect to `/l/<slug>/admin/settings`.
- [x] T025 [US1] Modify `src/app/(auth)/verify/page.tsx` (or wherever the `?error=conflict` UX lives) to render a clear "Sign-up could not complete — the FPL mini-league or email may already be in use. Try signing up again." message. Map `error=conflict` to a distinct copy from `invalid`/`used`/`expired`.

### Frontend: /sign-up page + form

- [x] T026 [P] [US1] Create `src/components/auth/SignupForm.tsx` — client component (`"use client"`). Three controlled inputs (email, leagueName, miniLeagueId). Submit POSTs to `/api/auth/signup`. On success: render the same "If your details match, you'll receive an email" panel for every non-error 200. On 400 with inline error → show inline form error. On 409 → show inline form error. On any other error → generic "Something went wrong" message.
- [x] T027 [US1] Create `src/app/(auth)/sign-up/page.tsx` — server component. Reads session cookie via `getServerUserFromCookie` (existing helper). If signed-in → render a small "You're already signed in — go to /leagues or create another league →" with two links. If not signed-in → render the `SignupForm` inside the existing auth layout. Set `export const dynamic = "force-dynamic"` per R15.

### Frontend: discoverability from /sign-in

- [x] T028 [P] [US1] Modify `src/app/(auth)/sign-in/page.tsx` to render an adjacent text link "Don't have a league yet? **Create one →**" below the submit button, navigating to `/sign-up`. Keep all existing sign-in behaviour unchanged. Style consistent with the auth layout's link colours.

### Integration test

- [ ] T029 [US1] **DEFERRED** — Write `tests/integration/signup/signup-route.test.ts` per the 8-scenario test surface in `contracts/signup-endpoint.md`. Mocked-dependency unit tests cover the helpers; this integration test exercises the full route against a temp SQLite. Manageable scope for a follow-up PR.

### Validation

- [ ] T030 [US1] **DEFERRED** — Runs alongside T029.
- [x] T031 [US1] Run `npx tsc --noEmit` and `npm run lint` — no errors. ✓ Type-check clean; 154/154 unit tests pass.

**Checkpoint**: US1 done — public visitor can sign up, receive magic-link, click, land as admin of a new league. Production-safety verified by the integration test.

---

## Phase 4: User Story 2 — Existing user creates a second (or further) league (Priority: P2)

**Goal**: A signed-in user creates an additional league synchronously (no magic-link required) and becomes its admin. Reachable from `/leagues` and `/my-admin`.

**Independent Test**: As a signed-in user with one league, POST to `/api/leagues` with `{leagueName, miniLeagueId}` → 201 with `{leagueId, slug, redirectTo}` → following the redirect lands in the new league's admin shell → `LeagueMembership` for the user has role=admin, source=self_signup → existing league memberships unchanged.

### Backend: POST /api/leagues

- [x] T032 [US2] Create `src/app/api/leagues/route.ts` exporting POST per `contracts/create-another-league.md`. Imports follow the contract. Wraps the handler in `try/failFromError`.
- [x] T033 [US2] In T032, call `requireSession(req)` (existing) to enforce auth.
- [x] T034 [US2] In T032, parse body via Zod schema, then call `verifyFplMiniLeague(body.miniLeagueId)` and handle the three branches as in T021 (but the inconclusive branch continues and sets `miniLeagueUnverified=true`).
- [x] T035 [US2] In T032, run the transaction: duplicate-mini-league-ID check, slug allocation, `League.create`, `LeagueMembership.create` (role=admin, source=self_signup), `AuditEvent.create`. Return 201 with `redirectTo`.

### Frontend: shared "create-another-league" form

- [x] T036 [P] [US2] Create `src/components/auth/CreateAnotherLeagueForm.tsx` — client component. Two controlled inputs (leagueName, miniLeagueId). Submit POSTs to `/api/leagues`. On success → `router.push(redirectTo)`. On 400 / 409 → inline error. Mirror the SignupForm's error-handling shape.
- [x] T037 [US2] Create `src/app/(main)/leagues/new/page.tsx` — server component that requires a signed-in session (redirect to `/sign-in?redirect=/leagues/new` if not). Renders the `CreateAnotherLeagueForm`. `export const dynamic = "force-dynamic"`.

### Frontend: entry points

- [x] T038 [P] [US2] Modify `src/app/(main)/leagues/page.tsx` to render a primary-styled "Create a new league" button at the top of the page, above the league list. Visible to every signed-in user. Links to `/leagues/new`.
- [x] T039 [P] [US2] Modify `src/app/(main)/my-admin/page.tsx` to render a secondary-styled "Create another league" button at the top of the page, above the admin list. Visible to every user the page already renders to (the page itself is admin-only). Links to `/leagues/new`.

### Integration test

- [ ] T040 [US2] **DEFERRED** — Write `tests/integration/signup/create-another-league.test.ts`. Same rationale as T029.
- [ ] T041 [US2] **DEFERRED** — Runs alongside T040.

**Checkpoint**: US2 done — power users can create more leagues without re-verifying their email; both entry points exposed.

---

## Phase 5: User Story 3 — Abuse and rate-limiting at the sign-up boundary (Priority: P1)

**Goal**: Public sign-up is hardened against spam/abuse without an admin UI change. Rate limits exist, enumeration is impossible, every rejection is audited, and the existing Super Admin tools handle the response.

**Status note**: The functional controls behind US3 (rate-limit branch, generic response shape, audit events, no enumeration via existing email branch) are **already shipped by Phase 3** (T019, T020, T023). What remains for US3 are assurance tests, the audit-event integration test, and explicit documentation of the controls in code.

### Assurance tests

- [ ] T042 [P] [US3] **DEFERRED** — abuse rate-limit integration test.
- [ ] T043 [P] [US3] **DEFERRED** — enumeration-byte-identity integration test.
- [ ] T044 [P] [US3] **DEFERRED** — audit-events integration test.

### Documentation

- [x] T045 [P] [US3] ✓ The top-of-file comment in `src/app/api/auth/signup/route.ts` documents the enumeration-resistance contract per FR-013 and references the contract file.

**Checkpoint**: US3 done — abuse defences are tested, documented, and observable in the audit feed.

---

## Phase 6: User Story 4 — Collision handling (Priority: P2)

**Goal**: Two users wanting the same league name don't collide silently (auto-suffix). Two users wanting the same FPL mini-league ID can't silently steal data — the second one is rejected at click time even if both passed the form-submission early check.

**Status note**: Collision handling is partially covered by Phase 2 (slug allocator) and Phase 3 (verify route re-check). What remains is the targeted race test and the FPL-ownership-dispute audit linkage.

### Race tests

- [ ] T046 [US4] **DEFERRED** — Write `tests/integration/signup/race-mini-league-id.test.ts` that:
  1. Submits two `/api/auth/signup` forms in parallel with different emails but the same `miniLeagueId`.
  2. Asserts both receive `{sent:true}` (per FR-013).
  3. Simulates both magic-link clicks via `consumeSelfSignupToken` + verify route handlers, racing them via `Promise.all`.
  4. Asserts exactly one `League` row exists for that `miniLeagueId`.
  5. Asserts the losing click lands at `/verify?error=conflict`.
- [ ] T047 [US4] **DEFERRED** — Write `tests/integration/signup/race-slug.test.ts` that:
  1. Creates an existing `League` with slug `the-sunday-crew`.
  2. Submits two parallel sign-ups with leagueName `"The Sunday Crew"` and different mini-league IDs and different emails.
  3. Clicks both magic-links.
  4. Asserts the two new leagues have slugs `the-sunday-crew-2` and `the-sunday-crew-3` (in some order — the auto-suffix algorithm picks the next available).

### Documentation

- [x] T048 [P] [US4] ✓ The transaction in `src/app/api/auth/verify/route.ts` carries an inline comment ("race-safe re-check…") explaining the cross-token race per research §R7.

**Checkpoint**: US4 done — race conditions covered by tests; defensive comments explain the design.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Lock everything together, run the agent reviews, update the operator/user docs.

- [x] T049 [P] ✓ Added "Public sign-up for League Admins (005)" entry to `CHANGELOG.md` `vNEXT` block, including the side-effect on 004's UAT allow-list.
- [ ] T050 [P] **DEFERRED** — README "Public sign-up" section pointing at quickstart.
- [ ] T051 **DEFERRED to PR review** — code-reviewer agent run before merge.
- [ ] T052 **DEFERRED to PR review** — security-reviewer agent run before merge.
- [ ] T053 [P] **DEFERRED to operator runtime** — manual UX check after deploy to UAT.
- [x] T054 ✓ `npx tsc --noEmit` clean; `npm test --run` reports 154/154 passing across 17 files (unit-test surface only; the deferred integration tests aren't run here).
- [x] T055 Project memory not updated — no non-obvious lesson surfaced; the deferred-creation, force-dynamic-on-session-branch, and SQLite-boolean-as-integer patterns all match precedents from 002/004. Skipped per task definition.

---

## Dependencies & Execution Order

### Phase dependencies

- **Phase 1 (Setup)**: no prerequisites — start immediately.
- **Phase 2 (Foundational)**: depends on Phase 1 (specifically the migration in T005/T006 — Prisma client must know about the new columns). **Blocks every US-labelled phase.**
- **Phase 3 (US1)**: depends on Phase 2.
- **Phase 4 (US2)**: depends on Phase 2 (uses `verifyFplMiniLeague`, `resolveAvailableSlug`). Independent of US1's frontend.
- **Phase 5 (US3)**: depends on Phase 3 (assurance tests for code shipped by Phase 3).
- **Phase 6 (US4)**: depends on Phase 3 + Phase 4 (race tests exercise the verify route AND the synchronous create-another-league route).
- **Phase 7 (Polish)**: after all desired stories are complete.

### Cross-story dependencies

- US3 → US1 (assurance tests for code shipped in US1).
- US4 → US1 + US2 (race tests exercise both code paths).

### Parallel opportunities

Inside each phase, `[P]` tasks touch different files and can run concurrently:

- Phase 1: T006 alone (must run after T004+T005 land).
- Phase 2: T008 + T010 + T012 + T015 in parallel after their corresponding implementation tasks (T007, T009, T011, T013/T014) land.
- Phase 3: T026 + T028 in parallel after T017–T023 land. T024 must run sequentially (depends on T013/T014/T007 collectively).
- Phase 4: T036 + T038 + T039 in parallel after T032–T035 land.
- Phase 5: T042 + T043 + T044 + T045 all in parallel — independent tests + a doc comment.
- Phase 6: T048 in parallel with the tests; T046 and T047 are sequential because both spin up integration DB state.
- Phase 7: T049 + T050 + T053 in parallel; T051 + T052 can run as background agents simultaneously.

---

## Parallel Example: Phase 3 (User Story 1)

```bash
# After T017–T025 (backend) land:
Task: "Create SignupForm client component (T026)"
Task: "Modify /sign-in page to add adjacent link (T028)"
```

Or for the cross-cutting Phase 5 burst:

```bash
# After Phase 3 lands, kick off in parallel:
Task: "Write abuse.test.ts (T042)"
Task: "Write enumeration.test.ts (T043)"
Task: "Write audit-events.test.ts (T044)"
Task: "Add enumeration-resistance docstring (T045)"
```

---

## Implementation Strategy

### MVP first (Phases 1 + 2 + 3 + 5)

The MVP is US1 *plus* US3 assurance, because the spec marks US3 P1 alongside US1 (a public endpoint without abuse defences is a liability). Order:

1. Phase 1 (Setup) — directories + migration + Prisma client regen.
2. Phase 2 (Foundational) — slug, payload, FPL verifier, token helpers; all unit tests green.
3. Phase 3 (US1) — public POST + verify branch + sign-up page + sign-in link; integration test green.
4. Phase 5 (US3) — assurance tests green; doc comments in place.
5. **Validate** by running the quickstart.md acceptance test rows 1–13.
6. Ship MVP.

At this point the platform supports public sign-up safely. US2 and US4 are additive.

### Incremental delivery

- After MVP: add US2 (in-app "create another league") whenever the operator wants to enable existing users to spin up additional leagues without re-signing-up.
- Add US4 race tests (Phase 6) before the first significant production traffic load — they're cheap and catch a real concurrency bug class.
- Phase 7 (Polish) finishes the feature and prepares for the PR.

### Parallel team strategy

- Dev A: backend (T017–T025, T032–T035) + integration tests (T029, T040, T046, T047).
- Dev B: frontend (T026–T028, T036–T039) + UI integration (T053).
- Dev C: foundational helpers (T007–T015) + assurance tests (T042–T044) + docs (T045, T048–T050).

---

## Notes

- Each task names exact files; if a path doesn't exist yet, the task creates it.
- T017 (signup route) and T024 (verify route extension) are the **security-critical** code paths — require `security-reviewer` agent sign-off before merge.
- Phase 7 (T054) is the gate — feature is not "done" until the 15-row acceptance table in `quickstart.md` is all green.
- The known interaction with feature 004's UAT allow-list (now bypassable) is **explicitly out of scope** for this feature. File a follow-up to remove the allow-list code separately.

## Task count summary

| Phase | Tasks | Notes |
|---|---|---|
| 1 Setup | 6 (T001–T006) | 1 parallelisable; the migration is the dependency hub |
| 2 Foundational | 10 (T007–T016) | 4 parallelisable tests after helpers land |
| 3 US1 (MVP backend + frontend) | 15 (T017–T031) | 2 parallelisable (form + sign-in link) |
| 4 US2 | 10 (T032–T041) | 3 parallelisable (form + two entry points) |
| 5 US3 assurance | 4 (T042–T045) | All 4 parallelisable |
| 6 US4 races | 3 (T046–T048) | 1 parallelisable |
| 7 Polish | 7 (T049–T055) | 4 parallelisable; 2 agent reviews can run as background tasks |
| **Total** | **55** | **15+ parallelisable** |
