# Specification Quality Checklist: Multi-League Platform

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-05-08
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic (no implementation details)
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification

## Notes

- **Resolved 2026-05-08**: FR-018 authentication mechanism — user selected **passwordless magic-link email only**. League Admin invitations are delivered as the recipient's first magic-link (invitation acceptance and first sign-in are the same step). No passwords are stored. Token lifetime, session duration, and email-delivery dependency captured in the Assumptions section.
- All checklist items now pass. Spec is ready for `/speckit.clarify` (optional) or `/speckit.plan`.

---

## Pre-cutover Verification (T100)

**Recorded**: 2026-05-12 · branch `002-multi-league-platform` at HEAD `0b5a019+` (T042/T045/T050 close-out).

| Gate | Command | Result |
| --- | --- | --- |
| TypeScript | `npx tsc --noEmit` | ✅ exit 0, no diagnostics |
| Unit tests | `npx vitest run` | ✅ 2 files / 3 tests passed |
| Integration tests | `npx vitest run --config vitest.integration.config.ts` | ✅ 9 files / 45 tests passed |
| Branding scan (SC-004) | included in unit run (`tests/unit/branding/no-industry-references.test.ts`) | ✅ 0 forbidden tokens in `src/` |
| Authz-coverage (T097) | included in unit run (`tests/unit/handlers/authz-coverage.test.ts`) | ✅ 30 league-scoped + 10 platform-scoped routes all gated |
| Migration dry-run (T092) | included in integration run (`tests/integration/migration.test.ts`) | ✅ legacy → multi-tenant migration verified; idempotent re-run produces no duplicates |
| League isolation (T050 / SC-006) | included in integration run (`tests/integration/league-isolation.test.ts`) | ✅ 6 route-level assertions — member-of-A → A/standings 200; → B/standings 404 (id and slug); unauthenticated 401; revoked-session 401; suspended-league 403 |
| Final branding grep (T099) | `git grep -i "energy.trading\|EnergyOne"` outside `specs/`, `CHANGELOG.md`, `tests/unit/branding/` | ✅ no matches |

### Items NOT exercised at this point (deferred to release-day operator)

- ~~**Playwright E2E (`npm run test:e2e`)** — requires `npx playwright install --with-deps chromium` (~150 MB browser download); deferred to T002 follow-up. Once the binary is installed, run `tests/e2e/member-isolation.spec.ts` (T051). Note: the route-level isolation assertions (T050) are now exercised by the integration suite, so the Playwright spec is a UI-layer sanity check rather than the SC-006 verifier.~~ **Closed 2026-05-17**: Chromium installed; T051 implemented as 3 specs (positive access, cross-league 404, unauthenticated redirect). `npm run test:e2e` runs `tests/e2e/setup-db.ts` to seed an isolated `prisma/e2e-test.db`, then `playwright test` launches a dedicated dev server on port 3100 against that DB. All 3 tests pass in ~19s on a fresh local run.
- **SMTP delivery smoke test** — send a real magic-link to the operator's address with production `SMTP_*` env vars set. The integration tests use the dev console-log fallback.
- **Migration on a real production DB snapshot** — `tests/integration/migration.test.ts` exercises the seed against a synthetic dataset. Before cutover, copy the live SQLite file to staging and run `npm run db:seed` against it; verify member counts and historical data match exactly. See `specs/002-multi-league-platform/quickstart.md` section 6.
- **Rollback dry-run** — verify the `prisma/migrations/002_multi_league/rollback.md` procedure end-to-end against a staging copy: snapshot, apply, restore from snapshot, confirm legacy app works. Recommended once before production cutover.

### Out-of-scope deferrals (tracked, not blockers)

- **T056 / digest port** — legacy `(main)/admin/page.tsx` deletion blocked by GW digest UI port to a new `/admin/digest` tab. Done at commit `0b5a019`.
- **T042** — Done at commit `7aee3b0`. All 13 analytics routes migrated to `/api/leagues/[leagueId]/<route>`. Legacy `/api/<route>` endpoints kept alive only for back-compat with the now-deleted legacy pages.
- **T045** — Done at commit `5da2fcf`. All 17 member-facing pages live at `(main)/l/[leagueSlug]/<route>`.
- **T050** — Done. `tests/integration/league-isolation.test.ts` is now the SC-006 verifier (6 assertions against the actual route handler).
- **T033 (partial)** — ADMIN_PIN env var still referenced by `auth.ts`/`auth-edge.ts` as a session-secret fallback and `lib/admin-auth.ts` is still consumed by 5 legacy `/api/org/*` and `/api/members/*` routes. Full purge lands with the contract migration after the legacy `/api/*` (non-league-scoped) routes are deleted.

These deferrals are documented in `tasks.md` with the precise unblocking step for each. They do not block the v1 multi-tenant cutover but should be cleared before the next release cycle.

---

## Pre-cutover Verification — Phase 8 (Multi-League Admin UX)

**Recorded**: 2026-05-13 · branch `002-multi-league-platform` at HEAD (T101–T108 close-out).

| Gate | Command | Result |
| --- | --- | --- |
| TypeScript | `npx tsc --noEmit` | ✅ exit 0, no diagnostics |
| Unit tests | `npx vitest run` | ✅ 3 files / 23 tests passed (incl. 20 new `admin-path-mapper` cases) |
| Integration tests | `npx vitest run --config vitest.integration.config.ts` | ✅ 10 files / 53 tests passed (incl. 8 new `multi-league-admin` cases) |
| Branding scan (SC-004) | included in unit run | ✅ 0 forbidden tokens in `src/` (new `/my-admin/page.tsx` is industry-neutral) |
| Authz-coverage (T097) | included in unit run | ✅ no new route handlers added — gate untouched |

### Multi-league admin UX manual sweep (from `quickstart.md`)

**Automated against the local E2E harness 2026-05-17** — all 6 items below are now exercised by `tests/e2e/multi-league-admin.spec.ts` (run via `npm run test:e2e`). The seed (`tests/e2e/setup-db.ts`) creates a multi-admin UserAccount on Leagues C+D (admin) and E (member); the spec drives a real Chromium browser through each check below. Operator should still re-run the same flow once against staging post-deploy as a smoke check, but a regression in any of these surfaces will now fail CI.

- [x] `/my-admin` shows both admin leagues (Charlie, Delta) with Settings / Members / Digest / Audit deep-link buttons; does NOT show the member-only Echo league. *(spec test #1)*
- [x] From `/l/charlie-e2e/admin/members` open the LeagueSwitcher and pick Delta → land at `/l/delta-e2e/admin/members` (admin sub-path preserved). *(spec test #2)*
- [x] From `/l/charlie-e2e/standings` open the LeagueSwitcher and pick Echo → land at `/l/echo-e2e/standings` (member fallback). *(spec test #3)*
- [x] `/leagues` shows two groups: "Leagues you administer" (Charlie + Delta with inline Settings/Members deep-links) and "Leagues you're a member of" (Echo). *(spec test #4)*
- [x] Inside `/l/charlie-e2e/standings`, the sidebar shows a "My admin leagues" link with `href="/my-admin"` (rendered because the user admins ≥ 2 leagues). *(spec test #5)*
- [x] Suspending Delta via a direct DB write → `/my-admin` still lists Delta but with a "Suspended" chip and the four deep-link labels rendered as disabled `<span aria-disabled="true">` rather than `<Link>`; Charlie's deep-links remain active alongside. *(spec test #6)*

**Suite result 2026-05-17**: `npm run test:e2e` → 9 passed in ~21s (3 from `member-isolation.spec.ts` + 6 from `multi-league-admin.spec.ts`).
