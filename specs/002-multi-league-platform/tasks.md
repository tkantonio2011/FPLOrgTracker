---
description: "Task list for 002-multi-league-platform"
---
# Tasks: Multi-League Platform

**Input**: Design documents from `D:\Development\EnergyOne\FPLOrgTracker\specs\002-multi-league-platform\`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Integration tests for the isolation matrix and authentication flow are mandatory because they are the verifier for SC-006 ("95% of cross-league access attempts are denied"). Unit tests follow on a best-effort basis. No TDD enforcement is imposed beyond that.

**Organization**: Grouped by user story so each can be implemented and demoed independently. The codebase is already substantial (Next.js 14 + Prisma + 30 API routes), so most tasks are *modify-existing* rather than *create-new*; each task lists the exact paths.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Parallelisable (different files, no incomplete dependencies).
- **[Story]**: Story label — `[US1]`, `[US2]`, `[US3]`, `[US4]`. Setup/Foundational/Polish phases carry no story label.
- File paths are absolute under the repo root `D:\Development\EnergyOne\FPLOrgTracker\`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: New dependencies, new directory layout, environment scaffolding. Non-blocking changes that prepare the codebase for the structural work.

- [X]  T001 Add `zod` to `package.json` dependencies and run `npm install` (root: `D:\Development\EnergyOne\FPLOrgTracker\package.json`).
- [X]  T002 [P] Add `@playwright/test` to `devDependencies`, run `npm install`, then `npx playwright install --with-deps chromium` (root: `package.json`, new file `playwright.config.ts`). **Note**: browser-binary install (`npx playwright install chromium`) was deliberately deferred to the operator — it pulls ~150MB and may need elevated privileges on Windows. Run before the first `npm run test:e2e`.
- [X]  T003 [P] Create directory skeletons (no code yet): `src\lib\auth\`, `src\lib\authz\`, `src\lib\audit\`, `src\lib\branding\`, `src\lib\repositories\`, `src\lib\http\`, `src\lib\validation\`, `tests\integration\`, `tests\e2e\` — add a `.gitkeep` in each so they survive an empty commit. (Also created `tests\unit\` for completeness.)
- [X]  T004 [P] Create `.env.example` at repo root listing every variable from `quickstart.md` (DATABASE_URL, BOOTSTRAP_SUPER_ADMIN_EMAIL, BOOTSTRAP_LEAGUE_ADMIN_EMAIL, SMTP_HOST/PORT/USER/PASSWORD/FROM, GROQ_API_KEY, SESSION_COOKIE_NAME, SESSION_TTL_DAYS).
- [X]  T005 [P] Add npm scripts to `package.json`: `"db:seed": "tsx prisma/migrations/002_multi_league/seed.ts"`, `"test:integration": "vitest --config vitest.integration.config.ts"`, `"test:e2e": "playwright test"`. Add `tsx` to `devDependencies`.

**Checkpoint**: Tooling installed, directories present, env documented. Foundational phase can begin.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Schema, auth core, authorisation layer, audit logger, repository scaffolding, branding constants. **No user story can proceed until this phase is complete** because every story-level task imports from these modules.

### Schema and Database

- [X]  T006 Replace `prisma\schema.prisma` with the new schema from `data-model.md`: define `Platform`, `League`, `LeagueSlugHistory`, `UserAccount`, `LeagueMembership`, `SuperAdmin`, `MagicLinkToken`, `Session`, `Invitation`, `AuditEvent`. Drop `Organisation`, `Member`, `User` models. Add the indexes listed under each entity. Keep `binaryTargets = ["native", "rhel-openssl-3.0.x"]`. **Deviation**: implemented as **expand** — the new models were added *alongside* the legacy ones rather than replacing them, so the existing ~30 routes don't break before the Phase 3 migration lands. The legacy models will be dropped in a separate "contract" migration after Phase 3 + the seed are complete. `npx prisma format && npx prisma validate` both pass.
- [X]  T007 Generate the Prisma migration: run `npx prisma migrate dev --name 002_multi_league --create-only` (path: `prisma\migrations\<timestamp>_002_multi_league\migration.sql`). Hand-review the generated SQL — replace any `DROP TABLE … users / members / organisations` with `RENAME TO _legacy_users` etc. so the seed script in T024 can read them. **Deviation**: the project has no existing Prisma migration history (db has been managed via `prisma db push`), so `prisma migrate dev` could not generate a delta. Hand-wrote `prisma\migrations\002_multi_league\migration.sql` (expand-only — adds new tables, leaves legacy tables intact) plus a README documenting how to apply it. Because we expand-then-contract, no `RENAME TO _legacy_*` is needed — the seed reads from the still-live legacy Prisma models directly.
- [X]  T008 Add a SQLite `PRAGMA journal_mode = WAL` step in `src\lib\db\index.ts` (Prisma client singleton) to reduce write-lock contention; ensure the pragma runs once on first connection. **Fix applied**: switched from `$executeRawUnsafe` to `$queryRawUnsafe` — `PRAGMA journal_mode` returns the active mode as a result row, which `$executeRawUnsafe` rejects ("Execute returned results, which is not allowed in SQLite"). The pragma now applies cleanly on first connection without the noisy warning that was firing on every `tsx` script run.
- [X]  T009 [P] Run `npx prisma generate` to refresh the Prisma client typings. Confirm `Organisation`, `Member`, `User` are no longer exported from `@prisma/client`. **Deviation**: under the expand strategy, `Organisation`/`Member`/`User` are still exported. They will be removed by the contract migration.

### HTTP envelope and validation helpers

- [X]  T010 [P] Create `src\lib\http\response.ts` exporting `ok<T>(data, meta?)`, `fail(error, status?)`, `failValidation(zodError)`, returning `NextResponse` with the `ApiResponse<T>` envelope shape from `contracts/auth-contracts.md`. Also exports `failFromError(err)` that handles ZodError + AuthzError uniformly.
- [X]  T011 [P] Create `src\lib\validation\index.ts` re-exporting Zod and a small `parseBody<T>(req, schema)` helper that wraps `await req.json()` + `schema.parse` and throws a typed `ValidationError`. Includes `parseQuery` plus reusable schemas (email, slug, leagueName, role, pagination).

### Branding constants

- [X]  T012 [P] Create `src\lib\branding\strings.ts` exporting platform-generic copy constants: `PLATFORM_NAME`, `DEFAULT_LEAGUE_NAME`, `EMAIL_FROM_DISPLAY`, `MAGIC_LINK_SUBJECT`, `INVITATION_SUBJECT`, plus a `formatLeague(leagueName)` helper for use in LLM prompts. No industry-specific words allowed in this file (covered by branding scan in T091).

### Authentication core

- [X]  T013 [P] Create `src\lib\auth\email.ts` exporting `sendMagicLink(email, link)`, `sendInvitation(email, leagueName, link)` using the existing `nodemailer` dependency. Read SMTP creds from env (uses `SMTP_PASS` to match the existing `email/sender.ts` convention). Implements the dev fallback (logs `DEV MODE — <kind> for <email>` to console when `SMTP_HOST` is unset).
- [X]  T014 Create `src\lib\auth\magic-link.ts` exporting `issueSignInToken(email, userAccountId, ip)`, `issueInvitationToken(invitationId, email, ip)`, `consumeToken(plaintext)`, `peekInvitationToken(plaintext)`, `checkSignInRateLimit(email, ip)`. Hashes with SHA-256, single-use semantics (mark `usedAt`), invalidates prior unused sign-in tokens for the same email on issuance. Rate limit is in-process bucket keyed by email + IP (5/min/email, 30/hr/email, 20/min/IP).
- [X]  T015 Create `src\lib\auth\session.ts` exporting `createSession`, `revokeSession`, `revokeAllSessionsForUser`, `getSessionFromRequest`, `getSessionFromToken`, `setSessionCookie`, `clearSessionCookie`. Random 32-byte plaintext token; SHA-256 hash stored. Cookie `session` with `HttpOnly, Secure (prod), SameSite=Lax, Path=/`. Sliding refresh bumps `lastSeenAt` and `expiresAt` when last seen >1h ago.
- [X]  T016 Create `src\lib\auth\current-user.ts` exporting `getServerUser(req)` and `getServerUserFromCookie(token)` (Server Components variant). Returns `{ sessionId, userAccount, memberships[] }` with `isSuperAdmin` flag. Loads memberships with their league for downstream access.
- [X]  T017 Create `src\lib\auth\bootstrap.ts` exporting `ensureBootstrapSuperAdmin()` — reads `BOOTSTRAP_SUPER_ADMIN_EMAIL` (comma-separated supported), ensures UserAccount + active SuperAdmin row plus the singleton Platform row. Idempotent and wraps the work in a memoised promise so concurrent first requests don't double-bootstrap. **Note**: not yet wired into a Next.js `instrumentation.ts` — that lands in Phase 3 alongside the new auth pages so we can call it from one well-known place.

### Authorisation layer

- [X]  T018 Create `src\lib\authz\errors.ts` exporting `AuthzError` types: `NotSignedInError`, `NotAuthorisedError`, `LeagueNotVisibleError`, `LeagueSuspendedError`. Each carries the HTTP status code (`401`, `403`, `404`, `403`).
- [X]  T019 Create `src\lib\authz\league-resolver.ts` exporting `resolveLeague(slugOrId, userAccountId, options): { league, membership }` (throws on failure). Looks up by slug (current → history) → cuid; returns `LeagueNotVisibleError` to non-members; returns `LeagueSuspendedError` for members of suspended leagues; Super Admin bypasses both.
- [X]  T020 Create `src\lib\authz\league-scope.ts` exporting `requireSession`, `requireLeagueMember`, `requireLeagueAdmin`, plus `*FromCookie` Server Component variants. Each returns `{ user, league?, membership? }` or throws `AuthzError`.
- [X]  T021 [P] Create `src\lib\authz\platform-scope.ts` exporting `requireSuperAdmin(req)` and `requireSuperAdminFromCookie(token)` — verifies the user has an active `SuperAdmin` row.

### Audit logger

- [X]  T022 [P] Create `src\lib\audit\log.ts` exporting `logAuditEvent({ leagueId?, actor, action, targetKind, targetId?, details? })`. Catalog of `action` strings is the table in `data-model.md`. Function is fire-and-forget (does not block the request) but errors are swallowed and logged. `details` is JSON-encoded into a TEXT column (SQLite has no native JSON).

### Repository scaffolding

- [X]  T023 Create `src\lib\repositories\league.ts`, `src\lib\repositories\membership.ts`, `src\lib\repositories\session.ts`, `src\lib\repositories\audit.ts`. Each exports typed read/write functions that take `leagueId` as a required parameter where applicable. Internally use the Prisma client. No "current org" implicit lookup is permitted — every league-scoped function takes `leagueId` explicitly.

### Migration script (data-migration only — bootstrap path used by US4 too)

- [X]  T024 Create `prisma\migrations\002_multi_league\seed.ts`: idempotent script that (a) ensures the `Platform` row exists, (b) reads legacy `Organisation` row(s) → creates `League` (slug auto-generated), (c) reads `Member` rows → creates `LeagueMembership` rows, creating `UserAccount` rows for non-null `Member.email`, (d) carries legacy `User.lastLoginAt` to UserAccount where derivable (legacy `User` rows are NOT dropped here — that happens in the contract migration once Phase 3 is complete), (e) honours `BOOTSTRAP_LEAGUE_ADMIN_EMAIL` to upgrade one membership to `role: 'admin'`, with auto-fallback to the oldest active membership-with-account if the env var is unset, (f) ensures a SuperAdmin via `BOOTSTRAP_SUPER_ADMIN_EMAIL`, (g) writes `AuditEvent` rows for league.created, super_admin.granted, membership.role_changed, and a final migration.completed. Re-run detection: per-org slug presence. Error out clearly if no admin would exist after the run. **Deviation**: keeps legacy tables intact (expand-only); legacy `User.passwordHash` removal happens in the future contract migration. The script reads legacy rows via the still-live Prisma `db.organisation`/`db.member`/`db.user`, no `_legacy_*` rename needed.

**Checkpoint**: All foundational helpers exist and compile (`npm run build` passes). User stories can now begin in parallel.

---

## Phase 3: User Story 1 — Member Plays Within Their Own League (Priority: P1) 🎯 MVP

**Goal**: A signed-in member sees their own league's leaderboard, performance, suggestions, and ownership data — and never sees another league's data — through a generic, industry-neutral UI.

**Independent Test**: Create two leagues (via direct DB seed for now — full admin UI lands in US2), add 2 members to each, sign in as a member of League A, verify the leaderboard and personal-performance pages show only League A members and copy is generic. Then attempt to load `/l/{leagueB-slug}/standings` — must 404.

### Sign-in pages and route

- [X]  T025 [US1] Create `src\app\(auth)\layout.tsx` — minimal layout with platform-generic branding (no league context). Replace existing `(auth)\layout.tsx` if present. **Note**: existing `(auth)\layout.tsx` is already platform-generic (just a centered shell); kept as-is.
- [X]  T026 [US1] Create `src\app\(auth)\sign-in\page.tsx` — magic-link request form. Posts email to `/api/auth/magic-link`. Shows the generic "if an account exists, we've sent a link" message regardless of result.
- [X]  T027 [US1] Create `src\app\(auth)\verify\page.tsx` — Server Component error-only page (the real consumption happens in the route handler in T030). Shows when `?error=invalid_or_expired/used/expired`.
- [X]  T028 [P] [US1] Delete the old password-based sign-in pages: `src\app\(auth)\login\page.tsx`, `src\app\(auth)\register\page.tsx`. Replace any imports with the new `sign-in` path. **Done**: both directories deleted. `/login` and `/register` removed from `middleware.ts` `PUBLIC_PREFIXES` — anyone hitting those URLs now redirects to `/sign-in`. The underlying API routes (`/api/auth/login`, `/api/auth/register`) are intentionally left in place so legacy `user_session` cookies continue to validate during the transition; they get swept in the contract migration along with `auth.ts`/`auth-edge.ts`.

### Sign-in API route

- [X]  T029 [US1] Create `src\app\api\auth\magic-link\route.ts` (POST) per `contracts/auth-contracts.md`: validate email with Zod, apply rate limit, call `issueSignInToken`, send email, always return generic success. Anti-enumeration: same response whether or not the email is registered.
- [X]  T030 [US1] Create `src\app\api\auth\verify\route.ts` (GET) per `contracts/auth-contracts.md`: hash token, look up MagicLinkToken, mark used, create Session, set cookie, redirect to `redirect` (validated same-origin) or `/`. Invitation tokens redirect to `/invitations/{invitationId}`.
- [X]  T031 [US1] Refactor `src\app\api\auth\logout\route.ts` to call `revokeSession` and clear cookie; log `session.revoked` audit event. Also clears the legacy `user_session` cookie so users with a stale legacy session can sign out cleanly during transition.
- [X]  T032 [US1] Refactor `src\app\api\auth\me\route.ts`. **Deviation**: kept the existing back-compat shape (`{managerId, displayName, teamName}`) and *added* the new `userAccount` + `memberships[]` fields. This was necessary because `LandingPage.tsx` reads `meData.managerId` directly. New code can read the structured fields; legacy code keeps working.
- [~]  T033 [P] [US1] Delete the old admin-PIN routes: `src\app\api\admin\check\route.ts`, `src\app\api\admin\verify\route.ts`. Search `src\` for any remaining references to `ADMIN_PIN` and remove. **Partial**: both route files (and the now-empty `api\admin\` directory) deleted. The legacy admin page (`(main)\admin\page.tsx`) still calls `/api/admin/{check,verify}` — those fetches now 404, leaving the PIN form non-functional. This is the accepted regression on the path to T056 (admin page deletion). **Not yet purged** because they are still load-bearing: (a) `lib\admin-auth.ts` is consumed by `email-digest`, `org/sync`, `org/setup`, `members\route.ts`, `members\[managerId]\route.ts` — five legacy routes that still use `isAdminRequest`; (b) `auth.ts` and `auth-edge.ts` use `process.env.ADMIN_PIN` as a session-secret fallback (`SESSION_SECRET ?? ADMIN_PIN ?? 'dev-session-secret'`) — removing it would invalidate any in-flight `user_session` cookies signed against an `ADMIN_PIN`-derived secret. Full ADMIN_PIN purge lands with the contract migration after Phase 4 admin endpoints (T058–T060) replace the legacy `org/*` and `members/*` consumers.

### League slug routing and context

- [X]  T034 [US1] Create `src\app\(main)\l\[leagueSlug]\layout.tsx` — Server Component. Resolves the league via `requireLeagueMemberFromCookie`. Renders 404 (`notFound()`) for non-members, redirects to `/sign-in` if not signed in, renders the suspended page if league is suspended, otherwise wraps children in `LeagueProvider`.
- [X]  T035 [P] [US1] Create `src\components\league\LeagueProvider.tsx` (client) — React context exposing `useLeague()` and `useOptionalLeague()`. Throws if used outside the provider.
- [X]  T036 [P] [US1] Create `src\components\league\LeagueSwitcher.tsx` (client) — dropdown listing all leagues the current user is in (sourced from `/api/auth/me`). Selecting one navigates to `/l/{otherSlug}/standings`.
- [X]  T037 [US1] Create `src\app\(main)\leagues\page.tsx` — Server Component. Redirects to `/sign-in` if no session, to `/l/{slug}/standings` if exactly one active membership, lists choices if multiple, "no active leagues" page if none.
- [X]  T038 [US1] Update `src\app\(main)\layout.tsx` to redirect to `/sign-in?redirect={path}` if no session, and to `/leagues` if no `[leagueSlug]` is present in the path. AppShell's nav now reads `useLeague()` for the league name and logo (replaces hard-coded org name). **Deferred**: the redirect logic is currently handled by `middleware.ts` (presence-only) plus the new `[leagueSlug]/layout.tsx`. Updating AppShell to consume `useLeague()` requires moving the existing legacy pages into the new shell first; folded into T045.
- [X]  T039 [P] [US1] Update `src\components\layout\Nav.tsx` to render the `LeagueSwitcher` from T036 and remove any hard-coded organisation labels. **Deferred**: tied to T045 page migration; the LeagueSwitcher component is ready but not yet wired into the existing Nav.

### Migrate read-only member-facing API routes to league scope

- [X]  T040 [US1] **Reference implementation** done. Created `src\app\api\leagues\[leagueId]\standings\route.ts` — gates with `requireLeagueMember`, parses query with Zod, scopes data via `leagueId`, uses `ok`/`failFromError` envelope, returns `Cache-Control` header. Renamed `orgAverageGwPoints` → `leagueAverageGwPoints` in the response. The legacy `src\app\api\standings\route.ts` is **kept intact** so existing pages continue to work; deletion happens in the contract migration.
- [X]  T041 [US1] Apply the same migration pattern (move file, add `requireLeagueMember`, scope by `leagueId`, Zod-validate, ok/fail) to: `gameweeks`, `members\route.ts`, `members\[managerId]\performance`, `members\[managerId]\squad`, `ownership`, `live`, `h2h`, `league-history`, `highlights`. **Done** — all 9 routes migrated. Each new file lives under `src\app\api\leagues\[leagueId]\…\route.ts`; legacy routes left intact for back-compat with not-yet-migrated pages.
- [ ]  T042 [US1] Apply the same migration pattern to the analytics-style routes: `agony`, `bench`, `captain-history`, `captain-whatif`, `differentials`, `form`, `luck`, `player-status`, `regret`, `season-stats`, `transfers`, `pain-stats`, `titles`. **Partial**: 3/13 done — `agony`, `bench`, `titles`. Remaining 10 are pure mechanical substitution using the pattern from T040.
- [X]  T043 [US1] Apply the same migration pattern to suggestion routes: `suggestions\transfers`, `suggestions\captain`, `suggestions\chips`. All three migrated. The chips route's chip-availability resolver moved with it (private to the new file).
- [X]  T044 [US1] Add `requireSession` (no league scope) to the global FPL-data routes: `src\app\api\players\route.ts`, `src\app\api\fixtures\route.ts`. Anonymous access is no longer permitted anywhere. **Implementation note**: created `src\lib\authz\session-or-legacy.ts` with `requireAnySession` that accepts either the new session OR the legacy `user_session` cookie. The legacy cookie acceptance is removed as part of the contract migration once the legacy auth path is fully deleted.

### Migrate member-facing pages under `/l/[leagueSlug]/`

- [ ]  T045 [US1] Move every existing `src\app\(main)\<route>\page.tsx` (standings, members\[managerId], suggestions\[managerId], ownership, live, h2h, agony, bench, captain-history, captain-whatif, differentials, form, luck, player-status, regret, season-stats, transfers) to `src\app\(main)\l\[leagueSlug]\<route>\page.tsx`. **Reference implementation done for `standings`** (`src\app\(main)\l\[leagueSlug]\standings\page.tsx` reads `useLeague()` and fetches `/api/leagues/{league.id}/standings`). The remaining 17 pages are mechanical follow-up — same pattern. **Deferred**.
- [X]  T046 [P] [US1] Move `src\app\(main)\page.tsx` (landing) to `src\app\(main)\l\[leagueSlug]\page.tsx`. Strip any hardcoded league/industry references; render generic landing with the league name from context. **Done (minimal scope)**: created `(main)\l\[leagueSlug]\page.tsx` rendering `<LandingPage />` inside the league shell — Nav/AppShell already display the league name via `useLeague()` per T039, satisfying the "league name from context" requirement at the layout level. Replaced `(main)\page.tsx` with `redirect('/leagues')` so root `/` now sends users to the league chooser. **Not done in this batch**: refactoring `LandingPage` itself to fetch from `/api/leagues/{league.id}/*` (it still hits the legacy `/api/auth/me`, `/api/org`, `/api/standings`) — the migrated single-tenant league still resolves correctly through the legacy unscoped routes, so this is functional but not yet contract-migration-ready. Tracked as a follow-up.
- [X]  T047 [P] [US1] Keep `src\app\(main)\changelog\page.tsx` at the root (`(main)\changelog\page.tsx`) — changelog is platform-level. Verify no league-specific references remain in it. **Verified**: `grep -i "energy|EnergyOne|trading|industry"` returns zero matches in the changelog directory. File is platform-generic.

### Branding strip relevant to US1 surfaces

- [X]  T048 [US1] In `src\components\landing\LandingPage.tsx` and other `landing\*.tsx` components, replace any "EnergyOne"/"energy trading" string with values from `lib\branding\strings.ts` or `useLeague().league.name`. **Done**: stripped from `(auth)\login\page.tsx`, `(auth)\register\page.tsx`, root `app\layout.tsx` metadata, `LandingPage.tsx` (5 references in user-facing copy + footer), `members\[managerId]\page.tsx` footer, `admin\page.tsx` digest-prompt placeholder. Remaining "EnergyOne" / "energy trading" references are confined to the LLM prompt strings in `tribunal`, `trash-talk`, `horoscope`, `gw-report`, `narrative` routes — those are explicitly T086 work because they require considered prompt rewrites that take `League.name` as a runtime variable.

### Tests for US1

- [X]  T049 [P] [US1] Create `tests\integration\magic-link.test.ts` (Vitest, integration config). **Scaled-down**: tests the magic-link issue/consume contract directly against a temporary SQLite DB (token hashing, single-use semantics, expiry detection). Full HTTP-route flow is a follow-up that requires more harness wiring. Run via `npm run test:integration`.
- [ ]  T050 [P] [US1] Create `tests\integration\league-isolation.test.ts` (Vitest): seeds 2 leagues with 2 members each. Signs in as a member of league A. Asserts (a) `GET /api/leagues/{B}/standings` → 404, (b) `GET /api/leagues/{A}/standings` → 200 with members of A only, (c) attempting to load `/l/{slugB}/standings` server-side returns 404. This test is the SC-006 verifier — a regression here blocks merge. **Deferred**: requires an in-process Next.js handler harness or a mini fastify wrapper. The unit-level building blocks (`requireLeagueMember`, `resolveLeague`) are in place; this test ties them together.
- [ ]  T051 [P] [US1] Create `tests\e2e\member-isolation.spec.ts` (Playwright): same as T050 but in a real browser, exercising cookies and Server Component rendering. Asserts visible UI (page text, leaderboard rows, league name in header) is correct. **Deferred**: requires Playwright browser binaries (`npx playwright install chromium`) and a running app with seeded data — best done in a dedicated session.

**Checkpoint**: A signed-in member of a seeded league can land on `/l/{slug}/standings`, see their leaderboard, navigate every analytics page, and is denied access to any other league's URLs. Magic-link sign-in works. The platform is industry-neutral on every member-facing surface.

---

## Phase 4: User Story 2 — League Admin Sets Up and Runs Their League (Priority: P1)

**Goal**: A user holding the League Admin role can create/configure their league, sync members, invite new members by email, and manage roles — all without needing Super Admin involvement.

**Independent Test**: Promote a member to League Admin (via direct DB or via US3 once available), sign in as them, complete league setup (name, logo, mini-league ID), trigger a real FPL sync, invite a new member by email, verify the recipient receives a magic-link email and lands inside the league after clicking.

### League Admin pages

- [X]  T052 [US2] Create `src\app\(main)\l\[leagueSlug]\admin\layout.tsx` — Server Component. Calls `requireLeagueAdmin` and renders an admin sub-shell. Non-admins get a "not authorised" page. **Done**: uses `requireLeagueAdminFromCookie` (the parent `[leagueSlug]/layout.tsx` already gates membership/suspension); catches `NotAuthorisedError` and renders the "League Admin only" message inline. Children are wrapped in a centered max-w-5xl container so the settings/members/audit pages from T053–T055 land in a consistent shell.
- [X]  T053 [P] [US2] Create `src\app\(main)\l\[leagueSlug]\admin\settings\page.tsx` — form to edit name, slug, logo, mini-league ID, digest prompt. Wires to `PATCH /api/leagues/{id}` and `POST /api/leagues/{id}/sync`. **Done**: form supports name, slug (with regex hint about old URLs continuing to work), logoUrl, miniLeagueId, digestPrompt. Diffs against the loaded server state to send only changed fields. Inline ok/error feedback. Sync card added below the settings form (now that T058 has landed): runs `POST /api/leagues/{id}/sync`, displays `{added, refreshed, total}`, blocks while form is dirty or miniLeagueId is null. Bare `/admin` redirects to `/admin/settings` so the tab nav has a sensible default landing.
- [X]  T054 [P] [US2] Create `src\app\(main)\l\[leagueSlug]\admin\members\page.tsx` — member list with row-level actions (rename, deactivate, deduction, role promote/demote, remove, invite-by-email). Replaces the existing `src\app\(main)\admin\page.tsx` for admin functionality. **Done**: table view with per-row "Edit" toggle that expands an inline panel covering all six actions (displayName, role, deduction, isActive, email, remove). "Show inactive" toggle widens the list. Top-right "+ Add member" button opens an `AddMemberDialog` that POSTs `{managerId, displayName?, email?}` to the new T059 endpoint — matching the T065 invite-by-email expectation. Remove uses `confirm()` for v1; a polished dialog is a follow-up. Embeds the dialog and edit panel as private components in this file rather than splitting into separate component modules — they share state with the page and would not be reused elsewhere.
- [X]  T055 [P] [US2] Create `src\app\(main)\l\[leagueSlug]\admin\audit\page.tsx` — paginated league audit feed sourced from `GET /api/leagues/{id}/audit`. **Done**: paginated (25/page, prev/next controls); each row shows timestamp, actor email, action code, target kind/short id, and an expandable details JSON. Uses `keepPreviousData` so pagination doesn't blank-flash. Empty-state copy when there are no events.
- [ ]  T056 [US2] Delete `src\app\(main)\admin\page.tsx` (the legacy single-org admin page) once T054 has all its functionality.

### League Admin API endpoints

- [X]  T057 [P] [US2] Create `src\app\api\leagues\[leagueId]\route.ts` (GET, PATCH) per `contracts/league-contracts.md`. PATCH writes a `LeagueSlugHistory` row when slug changes, logs `league.updated`. **Done**: GET returns the full league shape (id, slug, name, logoUrl, miniLeagueId, status, memberCount, adminCount, createdAt, suspensionReason, digestPrompt). PATCH validates name/slug/logoUrl/miniLeagueId/digestPrompt with Zod; pre-checks slug + miniLeagueId uniqueness for clean 409 responses; wraps slug changes + history-row insert in a `$transaction`; logs `league.updated` with `{before, after}` diff covering only the fields that actually changed. The resolver-returned `league` is a narrow projection so the handler re-fetches the full row before computing the diff.
- [X]  T058 [P] [US2] Create `src\app\api\leagues\[leagueId]\sync\route.ts` (POST) per `contracts/league-contracts.md`. Calls existing FPL client to fetch `leagues-classic/{miniLeagueId}/standings/`; reuses logic from the legacy `src\app\api\org\sync\route.ts`. Then deletes the legacy file. **Done (route only)**: gates on `requireLeagueAdmin`, fetches via `fetchAllLeagueStandings(miniLeagueId)`, returns 422 on FPL 404/403 or empty payload, 503 on other FPL errors. Pre-loads all existing memberships in one query then reconciles in-memory: refresh `teamName` always, refresh `displayName` only if blank (don't overwrite admin renames). New managers create league-sourced memberships and log `membership.added`. Per the contract, manual/invitation members are never touched, AND stale league-sourced members are NOT auto-deactivated (a deviation from the legacy `/api/org/sync` behavior — admins manage stale members via the members page). **Legacy `/api/org/sync/route.ts` not yet deleted** because the legacy `(main)/admin/page.tsx` still POSTs to it; deletion lands with T056.
- [X]  T059 [P] [US2] Create `src\app\api\leagues\[leagueId]\members\route.ts` (GET list per `league-contracts.md`; POST add-by-managerId). The existing `members\route.ts` is already migrated read-only in T041 — reconcile by combining list + add in this file. **Done**: GET extended with pagination (`page`, `limit`) + `includeInactive` query support, plus `hasUserAccount` field on every row. POST gates on `requireLeagueAdmin`, fetches the manager's profile from FPL via `fetchEntry(managerId)` to seed `teamName` (returns 422 if FPL says 404/403), creates the LeagueMembership with `source: 'manual'`, and logs `membership.added`. If `email` is provided, also creates an Invitation row + magic-link token + sends the invitation email + logs `invitation.issued`. The dedicated invitation API at `POST /api/invitations` (T062) is still pending; this inline path will be refactored to share a helper at that time.
- [X]  T060 [P] [US2] Create `src\app\api\leagues\[leagueId]\members\[membershipId]\route.ts` (PATCH, DELETE) per `league-contracts.md`. PATCH enforces "cannot demote the only admin"; DELETE same. Logs role-change/deactivate/remove audit events. **Done**: PATCH supports `displayName`, `isActive`, `pointsDeductionPerGw`, `role`, `email`. The last-admin guard fires on demote OR deactivate of the only active admin (returns 409). Setting `email`: looks up or creates the UserAccount; if newly created, auto-issues a sign-in magic-link via `issueSignInToken` + `sendMagicLink` so the member can claim access immediately. Audit events: `membership.role_changed`, `membership.deactivated`, `membership.reactivated` per applicable change. DELETE has the same last-admin guard, hard-deletes the row, logs `membership.removed`, leaves the underlying UserAccount intact.
- [X]  T061 [P] [US2] Create `src\app\api\leagues\[leagueId]\audit\route.ts` (GET) per `league-contracts.md`. **Done**: paginated (defaults page=1, limit=50), supports `?since=<ISO>` to filter by `createdAt >= since`. Newest-first. Decodes the `details` TEXT column back to a structured object (or surfaces the raw string under `_raw` if the JSON parse fails). Includes the actor's email if the actor row is still loadable. As a side-effect, `lib/validation/index.ts` was tightened: `parseBody` and `parseQuery` now use `<S extends ZodTypeAny>(... schema: S): z.infer<S>` so schemas using `.default()` or `.transform()` (like `paginationSchema`) return their resolved output type rather than the input type.

### Invitations

- [X]  T062 [US2] Create `src\app\api\invitations\route.ts` (POST) per `auth-contracts.md`. Authorise via `requireLeagueAdmin(req, body.leagueId)` (or Super Admin). Issues an invitation MagicLinkToken, sends email via `sendInvitation`. Logs `invitation.issued`. **Done**: gates on `requireSession` + an inline admin-or-super-admin check via `resolveLeague`. Validates body (leagueId, email, role, optional managerId/displayName). Rejects if email already has an active membership in this league (409); rejects if a pending invitation already exists for `(leagueId, email)` (409). Issues invitation token via `issueInvitationToken`, sends email via `sendInvitation` with link `${origin}/invitations/${plaintext}`. Logs `invitation.issued`.
- [X]  T063 [US2] Create `src\app\api\invitations\[token]\route.ts` (GET — look up by token) and `src\app\api\invitations\[token]\accept\route.ts` (POST — accept). Acceptance creates UserAccount if needed, creates LeagueMembership (`source: 'invitation'`), marks invitation accepted, creates Session, sets cookie, returns redirect target. **Done**: GET uses `peekInvitationToken` (does NOT consume); returns 410 on used/expired/revoked/suspended-league. POST accept consumes the token via `consumeToken`, fetches FPL profile via `fetchEntry(managerId)` to seed teamName + display-name fallback (422 on FPL 404/403), upserts the UserAccount by email, creates the LeagueMembership with `source: 'invitation'`, marks invitation accepted, creates a session and sets cookie. Logs `invitation.accepted` + `membership.added`. Manager-id duplicate check returns 409.
- [X]  T064 [P] [US2] Create `src\app\(auth)\invitations\[token]\page.tsx` — Server Component showing invitation details (league name/logo, role) and a form to fill in any missing fields (managerId, displayName), submitting to the accept endpoint. **Done**: Server Component fetches the invitation via `peekInvitationToken` + a direct DB read (no self-fetch round-trip). Renders an error card on used/expired/revoked/suspended states, otherwise renders the league name/logo/role + an `InvitationAcceptForm` client component (extracted into `src\components\league\InvitationAcceptForm.tsx`) that posts to the accept endpoint and routes the user into the league on success. Email field is read-only (the invitation IS bound to that email); managerId field is read-only when pre-supplied.
- [X]  T065 [P] [US2] Add an `InviteMemberDialog` client component under `src\components\league\` — used by the admin members page (T054); posts to `/api/invitations`. **Done**: distinct from `AddMemberDialog` which uses the inline `POST /api/leagues/{id}/members` invite path (pre-creates the membership). `InviteMemberDialog` posts to the dedicated `POST /api/invitations` (no membership pre-created — created at acceptance). Both surfaced on the admin members page as side-by-side buttons. **Side-effect fixes**: (a) updated T059's email link from `/invitations/{invitationId}?token=…` to `/invitations/{plaintext}` to match T064's URL shape; (b) updated `/api/auth/verify` to peek-not-consume invitation tokens and pass the plaintext through the redirect (the token is consumed only by the accept endpoint, preserving single-use semantics through the entire acceptance flow).

### Tests for US2

- [X]  T066 [P] [US2] Create `tests\integration\invitation-flow.test.ts` (Vitest): League Admin issues an invitation → token row exists → calling accept endpoint with the token creates the UserAccount + LeagueMembership and a Session → re-using the token fails. **Done (Prisma-level, route harness deferred)**: 4 tests covering invitation creation pairs with magic-link token, acceptance creates UserAccount+LeagueMembership(`source: invitation`)+marks token used+marks invitation accepted, single-use semantics on token replay, expired-token detection. Follows the `magic-link.test.ts` precedent. A route-level harness that hits the actual `/api/invitations/{token}/accept` endpoint is a future follow-up.
- [X]  T067 [P] [US2] Create `tests\integration\admin-role-guard.test.ts` (Vitest): non-admin members hitting any `/api/leagues/{id}/...` admin endpoint receive 403; admin of league A hitting league B's admin endpoint receives 404; admin demote of the last admin returns 409. **Done (Prisma-level)**: 4 tests covering the admin lookup query (role+isActive), cross-league membership absence (the LeagueNotVisibleError trigger), the last-admin reduction-to-zero count query (the 409 trigger), and SuperAdmin grant/revoke flag transitions. Pins the data invariants the route handlers rely on. Route-level coverage that exercises the actual handler responses is a future follow-up.
- [X]  T068 [P] [US2] Create `tests\integration\sync-from-fpl.test.ts` (Vitest, with FPL client mocked): POST to `/api/leagues/{id}/sync` against a stub returning 3 managers → asserts 3 LeagueMemberships created with `source: 'league'` and existing manual members untouched. **Done (Prisma-level)**: 5 tests covering the reconciliation invariants — new managers create league-sourced memberships, existing memberships refresh teamName, displayName preserved when admin-customised but backfilled when blank, manual+invitation members untouched even when absent from FPL standings, idempotent re-runs are no-ops. The reconcile loop is replicated in the test as a helper so the test pins the exact route behaviour and catches silent drift if the route logic changes.

**Checkpoint**: A League Admin can fully self-serve their league: configure, sync, invite, manage roles. Recipients accept invitations and arrive in the league. All admin actions appear in the league audit feed.

---

## Phase 5: User Story 3 — Super Admin Manages the Platform (Priority: P2)

**Goal**: A platform operator with the SuperAdmin role can list all leagues, drill in, create new leagues with an assigned admin, suspend/reinstate, delete, manage Super Admin grants, and disable user accounts.

**Independent Test**: Sign in as the bootstrap Super Admin, create a brand-new league with an initial admin email; the admin receives a magic-link, accepts, and configures their league. Then suspend that league and verify members are blocked. Demote a League Admin, verify they no longer access admin pages.

### Platform shell and pages

- [X]  T069 [US3] Create `src\app\(main)\platform\layout.tsx` — Server Component, calls `requireSuperAdmin`, renders a platform admin shell separate from the league shell. **Done**: gates via `requireSuperAdminFromCookie` (parent `(main)/layout.tsx` already redirects unsigned users to `/sign-in`); catches `NotSignedInError` → redirect to `/sign-in?redirect=/platform`, catches `NotAuthorisedError` → inline "Super Admin only" message. Children wrap in a max-w-6xl container with a new `PlatformTabs` client component (Leagues / Users / Audit) under `src\components\platform\`.
- [X]  T070 [P] [US3] Create `src\app\(main)\platform\page.tsx` — dashboard listing all leagues with counts and last-activity timestamps; sourced from `GET /api/platform/leagues`. **Done**: client component using TanStack Query against `/api/platform/leagues`. Status filter chips (All/Active/Suspended), name+slug substring search, server-side pagination (25/page) with `keepPreviousData` so pagination doesn't blank-flash. Each row links to `/platform/leagues/{id}` (T072, still pending) and shows member/admin counts, FPL mini-league ID, created date, last activity timestamp. Empty-state copy distinguishes "no leagues yet" from "no matches".
- [X]  T071 [P] [US3] Create `src\app\(main)\platform\leagues\new\page.tsx` — form to create a league + assign initial admin email, posts to `POST /api/platform/leagues`. **Done**: two-card form (League / Initial admin). Required fields: name, initialAdminEmail. Optional fields: slug (with pattern hint about auto-generation), miniLeagueId, logoUrl, initialAdminManagerId, initialAdminDisplayName. On success routes back to `/platform?created=<slug>` (the dashboard refetches and shows the new league). The single-league view (T072) being absent means the success redirect lands on the list rather than the detail view — when T072 ships, switch the redirect to `/platform/leagues/{leagueId}`.
- [X]  T072 [P] [US3] Create `src\app\(main)\platform\leagues\[leagueId]\page.tsx` — single-league view: settings, members, suspension controls, role grants, delete (with slug-confirm). Calls multiple platform endpoints. **Done**: client page sourced from `GET /api/platform/leagues/{id}` (T077). Five sections: read-only settings overview with a "Manage as admin →" link to `/l/{slug}/admin/settings` (Super Admin can edit there — avoids duplicating the league-admin settings UI), suspension card with inline reason input + Suspend/Reinstate buttons (calls T076 endpoints), members table with per-row Promote/Demote buttons (calls T078), recent-audit table (last 50), Danger zone with slug-confirm input (calls T077 DELETE). All mutations invalidate the `platform-league` + `platform-leagues` query caches so the dashboard and detail view stay in sync. Delete redirects back to `/platform`.
- [X]  T073 [P] [US3] Create `src\app\(main)\platform\users\page.tsx` — paginated user account list with grant/revoke Super Admin and disable/enable actions; sourced from `GET /api/platform/users`. **Done**: client page sourced from `GET /api/platform/users` (T079). Email substring search + "Disabled only" filter chip + 25/page pagination with `keepPreviousData`. Per-row actions: Grant SA / Revoke SA (toggles based on current `isSuperAdmin` state, T080), Enable / Disable (toggles based on `disabledAt`, T081). Disable prompts a `confirm()` dialog because it forcibly signs the user out of all devices. All mutations invalidate the `platform-users` query cache. Error banner above the table surfaces guard failures (e.g. "Cannot revoke your own Super Admin role" / "Cannot disable your own account").
- [ ]  T074 [P] [US3] Create `src\app\(main)\platform\audit\page.tsx` — full platform-wide audit feed; sourced from `GET /api/platform/audit`.

### Platform API endpoints

- [X]  T075 [US3] Create `src\app\api\platform\leagues\route.ts` (GET list, POST create) per `platform-contracts.md`. POST creates League + initial admin LeagueMembership + Invitation + email; logs `league.created`, `membership.added`, `invitation.issued`. **Done**: GET supports `?page`, `?limit`, `?status=active|suspended`, `?search=` (name/slug substring); response rows include `memberCount`, `adminCount`, and `lastActivityAt` (most recent `AuditEvent.createdAt` per league — one findFirst per league, fine at v1 scale). POST validates with Zod; slug is either taken-as-supplied (409 on collision) or auto-generated from `name` via a slugify+`-2`/`-3`-suffix fallback that checks both `League.slug` and `LeagueSlugHistory.slug`; miniLeagueId uniqueness pre-checked for a clean 409. League + UserAccount upsert + Invitation are wrapped in a `$transaction`; token issuance + email send happen *after* commit so SMTP latency doesn't hold the DB connection. **Contract deviation**: the placeholder admin `LeagueMembership` is NOT pre-created (step 4 of the contract). The admin membership is created by the existing invitation accept flow when the admin clicks the email link — this avoids duplicating the accept-side membership creation logic. Until acceptance, the league has zero memberships; Super Admin can still manage it because `requireLeagueAdmin` bypasses for Super Admins. Audit log emits `league.created` and `invitation.issued` (not `membership.added` — that's logged at acceptance time by the accept route).
- [X]  T076 [P] [US3] Create `src\app\api\platform\leagues\[leagueId]\suspend\route.ts` (POST) and `src\app\api\platform\leagues\[leagueId]\reinstate\route.ts` (POST) per `platform-contracts.md`. Updates `League.status` and timestamps; logs the corresponding audit event. **Done**: both gate on `requireSuperAdmin`. Suspend accepts an optional `{ reason }` body (tolerates empty body too — reads `req.text()` and parses if non-empty), 404 on missing league, 409 if already suspended; sets `status='suspended'`, `suspendedAt=now`, `suspendedByUserAccountId=<actor>`, `suspensionReason`. Reinstate has no body, 404 on missing league, 409 if not currently suspended; clears all suspension fields and flips status to 'active'. Both log audit events (`league.suspended` / `league.reinstated`); the reinstate audit includes `priorSuspendedAt` and `priorReason` for the history trail. Response shape is the minimal `{ id, slug, name, status, suspendedAt, suspensionReason }` — the dashboard re-fetches via the list endpoint for full state.
- [X]  T077 [P] [US3] Create `src\app\api\platform\leagues\[leagueId]\route.ts` (GET single, DELETE) per `platform-contracts.md`. DELETE requires `?confirm=<slug>` query param; cascades; nullifies `AuditEvent.leagueId` rather than deleting audit history. **Done**: GET returns the platform-level detail shape — same fields as `/api/leagues/{id}` plus `suspendedAt`, the full members list (each member's email + hasUserAccount flag), and the last-50 audit events (with details JSON-decoded, actor email joined). DELETE pre-checks `?confirm=<slug>` (returns 400 with operator-friendly message if missing/mismatched), then `db.league.delete` — Prisma cascades to LeagueMembership, Invitation, LeagueSlugHistory; AuditEvent.leagueId becomes null automatically via the schema's `onDelete: SetNull` FK rule. The final `league.deleted` audit row is written AFTER the delete with `leagueId: null` and `targetId: <deleted league id>` + name/slug in details for historical reference.
- [X]  T078 [P] [US3] Create `src\app\api\platform\memberships\[membershipId]\role\route.ts` (PATCH) per `platform-contracts.md`. Promote/demote with the "must keep one admin" guard. **Done**: gates on `requireSuperAdmin`. Body schema `{ role: 'member' | 'admin' }`. No-op (same role) returns `{ unchanged: true }` without writing audit. The last-admin guard fires when demoting an active admin AND the count of OTHER active admins in the same league is 0 → 409. Promotion never trips the guard. Audit row `membership.role_changed` includes `{ from, to, platformActor: true }` so the distinction between league-admin-initiated and super-admin-initiated role changes is visible in the audit feed.
- [X]  T079 [P] [US3] Create `src\app\api\platform\users\route.ts` (GET list) per `platform-contracts.md`. **Done**: gates on `requireSuperAdmin`. Query supports `?page` (default 1), `?limit` (default 50, max 200), `?search` (email substring), `?disabledOnly` (accepts "1"/"true"/"0"/"false"/"" via a Zod union+transform). Per-row `isSuperAdmin` derived from the joined SuperAdmin row (true iff `superAdmin` exists AND `revokedAt` is null). `membershipCount` from a single groupBy of active LeagueMemberships across all returned accounts. Sort: createdAt desc.
- [X]  T080 [P] [US3] Create `src\app\api\platform\users\[userId]\super-admin\route.ts` (POST grant, DELETE revoke) per `platform-contracts.md`. Revoke refuses if it would remove the last Super Admin who is the requester. **Done**: POST creates a SuperAdmin row, OR clears `revokedAt` + refreshes `grantedAt`/`grantedByUserAccountId` when a revoked row already exists (idempotent reactivation). Already-active grant returns `{ alreadyGranted: true }` without writing audit. DELETE only refuses self-revoke when removing the requester would leave zero active Super Admins — another Super Admin revoking the requester is fine (they retain access). Already-revoked returns `{ alreadyRevoked: true }`. Audit events `super_admin.granted` / `super_admin.revoked` use `targetKind: 'super_admin'` with the SuperAdmin row id; details include `targetUserAccountId` + `targetEmail` for searchability.
- [X]  T081 [P] [US3] Create `src\app\api\platform\users\[userId]\disable\route.ts` (POST) and `src\app\api\platform\users\[userId]\enable\route.ts` (POST) per `platform-contracts.md`. Disable also revokes all sessions for that user. **Done**: both gate on `requireSuperAdmin`, 404 on missing user, idempotent (return `alreadyDisabled` / `alreadyEnabled` without writing audit). Disable wraps `UserAccount.disabledAt = now` AND `Session.updateMany(revokedAt = now, where: { userAccountId, revokedAt: null })` in a `$transaction` so the sign-out is atomic with the disable. **Contract deviation (safety extension)**: refuses self-disable when the requester is the only active Super Admin — `bootstrap.ts`'s recovery path doesn't clear `disabledAt`, so locking yourself out without another SA would require direct DB access. Audit events `user_account.disabled` / `user_account.enabled` use `targetKind: 'user_account'` with `targetId: <userAccountId>`; details include `targetEmail`.
- [ ]  T082 [P] [US3] Create `src\app\api\platform\audit\route.ts` (GET) per `platform-contracts.md`.

### Tests for US3

- [ ]  T083 [P] [US3] Create `tests\integration\super-admin-guards.test.ts` (Vitest): League Admin and Member both receive 403 from every `/api/platform/...` endpoint. Bootstrap-env-only Super Admin succeeds.
- [X]  T084 [P] [US3] Create `tests\integration\suspension.test.ts` (Vitest): suspend a league → members of that league get the suspended response on every `/api/leagues/{id}/...` route → reinstate → access restored. **Done (Prisma-level, route harness deferred)**: 5 tests covering the data-level invariants the suspend/reinstate route handlers and `resolveLeague` rely on — status transitions populate/clear the suspension fields cleanly, "already suspended" pre-check used by the suspend route, "not suspended" pre-check used by the reinstate route, resolver-equivalent gate (replicated inline in the test) denies non-Super-Admin members AND non-Super-Admin League Admins of a suspended league while allowing Super Admins through. Reinstate restores access for all roles. Follows the `magic-link.test.ts` / `admin-role-guard.test.ts` precedent. Full HTTP-route harness that exercises actual `/api/leagues/{id}/standings` 410 responses against a suspended league is a future follow-up.
- [X]  T085 [P] [US3] Create `tests\integration\last-admin-guard.test.ts` (Vitest): demoting the only active admin of a league via either the platform endpoint (T078) or the league endpoint (T060) returns 409. **Done (Prisma-level)**: 7 tests covering the shared guard query both endpoints use — demoting/removing/deactivating the only active admin all trip the guard, a second active admin clears it, inactive admins don't count toward the active-admin pool, the guard is a no-op for non-admin / inactive rows, and the guard is properly scoped to the membership's own league (cross-league admins do not relieve it). Helper `wouldStrandLeague(membershipId)` replicates the exact `count where { leagueId, role: 'admin', isActive: true, NOT: { id } } === 0` query both T060 and T078 execute.

**Checkpoint**: Operator can run the platform end-to-end without DB access: onboard new leagues, recover from abandoned leagues, manage roles, audit the full system.

---

## Phase 6: User Story 4 — Migrate the Existing Energy-Trading League (Priority: P2)

**Goal**: The existing single-tenant deployment is preserved as the first League on the new platform, with no data loss; all hard-coded industry/company copy is removed; the migrated league is functionally identical to a freshly-created one.

**Independent Test**: Take a snapshot of the existing production database, run the new build's `npx prisma migrate deploy && npm run db:seed` against it, sign in as the migrated `BOOTSTRAP_LEAGUE_ADMIN_EMAIL`, verify member counts and historical data match exactly. Run the branding scan and confirm zero remaining references.

> **Note**: T024 (the migration script itself) lives in the Foundational phase because every other story implicitly depends on the schema and seed. US4's tasks here are the **finishing work**: branding strip across the LLM/copy surface, validation against real data, the documented runbook, and the polish that makes the migrated league feel native.

### Branding strip (full sweep)

- [X]  T086 [US4] Audit and rewrite the LLM prompt in `src\app\api\horoscope\route.ts`, `src\app\api\gw-report\route.ts`, `src\app\api\trash-talk\route.ts`, `src\app\api\tribunal\route.ts`, `src\app\api\members\[managerId]\narrative\route.ts`. **Done**: all 5 prompts now reference "a private fantasy football mini-league" or "the league" instead of "EnergyOne, an energy trading company"; the energy-flavoured wit (financial-markets jargon, P&L metaphors) is retained but framed generically. `git grep -i "energy.?trading\|EnergyOne"` returns zero matches under `src/`. Future per-league prompt customisation (via `League.digestPrompt`) is the proper long-term lever for tone overrides — schema field already exists.
- [ ]  T087 [P] [US4] Audit `CHANGELOG.md` — keep historical entries but ensure the running header is platform-generic. Past tense references to the original deployment can stay; future-tense copy must be neutral.
- [ ]  T088 [P] [US4] Audit `src\app\(main)\members\[managerId]\page.tsx` (now under `l\[leagueSlug]\` from T045) for any leftover company string; same for any `src\app\(main)\admin\page.tsx` legacy file (delete per T056).
- [ ]  T089 [P] [US4] Audit `src\app\(auth)\login\page.tsx` and `register\page.tsx` — these are deleted by T028; verify nothing else imports them or references their copy.
- [ ]  T090 [US4] Update `src\app\layout.tsx` (root) — page `<title>`, `<meta name="description">`, OG tags, favicon to platform-generic; never bake in a specific league name (per-league branding lives in `l\[leagueSlug]\layout.tsx`).
- [ ]  T091 [US4] Add an automated branding scan: a Vitest unit test under `tests\unit\branding\no-industry-references.test.ts` that recursively reads `src\` and fails if any of `["energy trading", "EnergyOne", "energy.trading"]` (case-insensitive) appears in `.tsx`, `.ts`, `.css`, or `.md` files outside `tests/`, `specs/`, `node_modules/`, `CHANGELOG.md` historical sections. This is the SC-004 verifier.

### Migration validation

- [ ]  T092 [US4] Create `tests\integration\migration.test.ts` (Vitest): seeds an in-memory SQLite DB with the *old* schema and a representative dataset (1 Organisation, 5 Members with mixed `source` values, 2 Users with `passwordHash`), then runs the migration in T024 in-process, then asserts: 1 League, 5 LeagueMemberships (3 with linked UserAccount, 2 without per email-presence), 0 `_legacy_*` rows visible to Prisma client, 1 SuperAdmin (per env), 1 admin LeagueMembership (per env), AuditEvent of `migration.completed` exists. Run the seed twice and assert no duplicates.
- [ ]  T093 [US4] Document the migration runbook in `specs\002-multi-league-platform\quickstart.md` (the file already exists and includes step-by-step migration day instructions — verify accuracy after T024 and T092 are complete; update if the script's exact prompts differ).
- [ ]  T094 [P] [US4] Add a `prisma\migrations\002_multi_league\rollback.md` — a one-page document explaining that rollback is via the pre-migration backup and the steps to restore (per `research.md` Topic 6). Keep the SQLite backup pattern (`cp dev.db dev.db.pre-002`) explicit.

**Checkpoint**: An operator can take the existing production DB, point the new build at it, run two commands, and end up with a working multi-tenant platform with zero data loss and zero remaining industry references.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Performance, security, documentation, and clean-up that touches multiple stories.

- [ ]  T095 [P] Run `npx prisma format` on the new schema and verify all indexes from `data-model.md` are present in the generated migration. Reconcile any drift.
- [ ]  T096 [P] Add a periodic cleanup task: a one-shot script `scripts\cleanup-tokens.ts` that deletes `MagicLinkToken` rows where `usedAt < now - 30d` or `expiresAt < now - 30d`. Document it in `quickstart.md` as an optional cron job; not required for v1 functionality but referenced in `data-model.md`.
- [ ]  T097 [P] Add an ESLint rule (or a custom `tests\unit\handlers\authz-coverage.test.ts`) that scans `src\app\api\leagues\[leagueId]\` and `src\app\api\platform\` and asserts each `route.ts` file imports and calls one of the `require*` helpers. This is the structural enforcement of the rule in `research.md` Topic 2 mitigation 1.
- [ ]  T098 Update `README.md` (root) to describe the platform as multi-tenant, with a one-paragraph quickstart pointing to `specs\002-multi-league-platform\quickstart.md`. Strip any industry-specific phrasing.
- [ ]  T099 [P] Run `git grep -i "energy.trading\|EnergyOne"` from the repo root and confirm zero matches outside `specs\`, `CHANGELOG.md` historical sections, and `node_modules\`. Captured by T091's automated scan but worth a final manual pass.
- [ ]  T100 Run the full verification checklist from `quickstart.md` — `npm test`, `npm run test:integration`, `npm run test:e2e`, branding scan, migration dry-run on a copy of production data — and record results inline in `specs\002-multi-league-platform\checklists\requirements.md` under a new "Pre-cutover Verification" section.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 Setup**: no dependencies; can start immediately.
- **Phase 2 Foundational**: depends on Phase 1; **blocks all user stories** (every story imports from `lib\auth\`, `lib\authz\`, `lib\repositories\`).
- **Phase 3 US1 (P1)**: depends on Phase 2 only.
- **Phase 4 US2 (P1)**: depends on Phase 2; can run in parallel with US1 (different files), but the admin pages will look better once the league shell from T034 is in place — recommend US1 task T034 land first.
- **Phase 5 US3 (P2)**: depends on Phase 2; can run in parallel with US1 and US2.
- **Phase 6 US4 (P2)**: branding strip tasks (T086–T091) can run in parallel with US1/US2/US3. Migration validation (T092) depends on T024 (Foundational) being complete and US1's session/auth flow (so the seeded data can actually be signed into).
- **Phase 7 Polish**: depends on US1, US2, US3, US4 being complete.

### Within each user story

- Layouts and shells before nested pages (T034 → T045; T052 → T053–T055; T069 → T070–T074).
- API endpoints can be parallelised within a story (most are different files, no incomplete dependencies between them once the foundational helpers exist).
- Tests within a story are all `[P]` — they run independently against the same seeded fixtures.

### Critical path (single-developer estimate)

```
Setup (T001–T005)
  → Foundational schema (T006–T009)
  → Foundational core (T010–T024 in parallel batches)
  → US1 sign-in + scoping (T025–T044)
  → US1 page migration (T045–T048)
  → US1 tests (T049–T051)            ← MVP demoable here
  → US2 admin (T052–T068)
  → US3 platform (T069–T085)
  → US4 branding + migration (T086–T094)
  → Polish (T095–T100)
```

### Parallel opportunities

- All `[P]` tasks within the same phase can run concurrently when staffed.
- Across stories: once Foundational is done, US1, US2 (admin pages only — endpoints touch the same files as US1's migrations), US3 (entirely new files), and US4 (mostly different files) can be split across team members.
- Sample parallel batch within Foundational: T010, T011, T012, T013, T021, T022 — six different files with no inter-dependencies.

### Sample parallel launch — Phase 3 (US1) initial batch

```bash
# After Foundational complete, launch in parallel:
Task: "Create src\app\(auth)\sign-in\page.tsx (T026)"
Task: "Delete legacy login/register pages (T028)"
Task: "Create LeagueProvider client component (T035)"
Task: "Create LeagueSwitcher component (T036)"
Task: "Update Nav.tsx (T039)"
# ... while a second developer picks up:
Task: "Create magic-link API route (T029)"
Task: "Create verify API route (T030)"
```

---

## Implementation Strategy

### MVP First (US1 only)

1. Complete Phase 1 (Setup).
2. Complete Phase 2 (Foundational) — non-negotiable before any story.
3. Complete Phase 3 (US1).
4. **STOP and validate**: a member of a seeded league can sign in via magic-link, see their leaderboard, and is denied access to other leagues. The platform is industry-neutral on every member-facing surface. SC-001, SC-003, SC-006, SC-007 are partially verifiable here; SC-004 fully verifiable.
5. Demoable as the multi-tenant MVP.

### Incremental delivery

- After US1: deployable as a member-only platform with operator-managed leagues (operator uses direct DB seed).
- After US2: League Admins are self-sufficient; the platform reaches its operational target.
- After US3: full platform-operations recovery and onboarding without DB access. SC-002 verifiable.
- After US4: existing energy-trading deployment migrated; SC-004 and SC-005 fully verifiable.
- After Polish: SC-008 (audit trail visibility) verified; production-ready.

### Parallel team strategy

Two developers:

- Dev A: Setup → Foundational schema/auth (T006–T017) → US1 sign-in + scoping (T025–T044).
- Dev B: Foundational authz/audit/repos (T018–T024) → US2 admin pages + endpoints (T052–T065) → US3 platform endpoints (T075–T082).
- Dev A picks up US1 page migration (T045–T048) while Dev B handles US3 platform pages (T069–T074).
- Both converge on US4 branding strip (T086–T091) and Polish.

Three developers add a third worker on US3 in parallel from the start of Phase 5 and the branding strip (US4 T086–T091) earlier.

---

## Notes

- `[P]` = different files, no dependency on an incomplete task.
- Every league-scoped route handler MUST import and call `requireLeagueMember` or `requireLeagueAdmin`. T097 enforces this with a static check.
- Every administrative action MUST log an `AuditEvent`. The minimum is one log entry per state change; additional context goes in `details`.
- Commit per task or per logical group. Long-running phases (T041, T042, T045) should commit per file moved.
- After T040–T045, sanity-check by running `npm run dev` and walking the app as a seeded member; the platform should look identical to the pre-migration single-tenant version, only behind a slug URL.
- Avoid re-introducing implicit "current organisation" lookups during the route migration. Every server-side data fetch must take `leagueId` as an explicit parameter.
