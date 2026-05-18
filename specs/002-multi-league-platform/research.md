# Research: Multi-League Platform

**Phase**: 0
**Branch**: `002-multi-league-platform`
**Date**: 2026-05-08

This document resolves the open questions raised in `plan.md`'s Technical Context and the spec's `[NEEDS CLARIFICATION]` markers, and captures the design rationale for each significant choice. The user's answer in `/speckit.specify` (Magic-link email only, Option A) is the binding decision for authentication.

---

## Topic 1: Authentication — Passwordless Magic-Link

### Decision

Sign-in is exclusively via passwordless email magic-link. The user enters an email address; the platform issues a single-use, time-limited token; the user clicks the link; the platform verifies the token, creates a server-side session, and sets a session cookie. Passwords are not stored. The existing `User.passwordHash` column is dropped during migration.

### Rationale

- Direct fulfillment of FR-018 (user-selected option).
- Eliminates password storage, password reset flows, breach-response surface, and password-related support tickets.
- Invitation flow (FR-019) collapses naturally: the invitation email IS a magic-link bound to the invited email, so accepting the invitation and signing in for the first time are the same action.
- Platform users come from many different companies (per the spec's framing); we cannot rely on a single corporate IdP. Magic-link works for anyone with an email.

### Token Design

- Token = 32 random bytes, base64url-encoded (~43 characters), opaque.
- Database row: `MagicLinkToken { id, userAccountId, tokenHash (sha256), purpose ('sign-in' | 'invitation'), invitationId?, leagueId?, expiresAt, usedAt, createdAt }`. Only the **hash** of the token is stored; the plaintext is delivered exactly once via email.
- Lifetime: 15 minutes for sign-in tokens, 7 days for invitation tokens (industry-standard windows).
- Single-use: `usedAt` is set on first successful verify; subsequent attempts fail.
- Concurrent issuance: requesting a new sign-in link invalidates any unused outstanding link for the same UserAccount (delete-and-replace).

### Session Design

- A successful magic-link verify creates a `Session { id, userAccountId, tokenHash (sha256), expiresAt, lastSeenAt, userAgent, ip }` row.
- The session cookie carries a random opaque token (not signed); validity is determined by hashed lookup, allowing server-side revocation.
- Cookie lifetime: 30 days (sliding) — `Session.expiresAt` is bumped on every authenticated request more than 1 hour after `lastSeenAt`.
- Cookie attributes: `HttpOnly`, `Secure` (prod), `SameSite=Lax`, `Path=/`. Name: `session` (replaces existing `user_session`).
- Server-side revocation triggered by: explicit logout, admin-initiated revoke (Super Admin → user), league suspension (sessions are not invalidated globally; the authorisation layer denies access), account deletion.

### Email Delivery

- Reuse existing `nodemailer` dependency (already in `package.json`).
- New env vars: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`. Document in `.env.example`.
- New `lib/auth/email.ts` exposes two functions: `sendMagicLink(email, link)` and `sendInvitation(email, leagueName, link)`. Templates are plain HTML with platform-generic copy (no industry references).
- Local-dev fallback: when `SMTP_HOST` is unset, log the link to the console with a clear "DEV MODE — magic link" prefix so developers can sign in without an SMTP server.

### Security Considerations

- Rate-limit magic-link requests per email (5/minute, 30/hour) and per IP (20/minute) — implement in `lib/auth/magic-link.ts`. Returns the same generic "if an account exists for that address, we've sent a link" response regardless of whether the email is registered, to avoid account enumeration.
- Always issue a verification *redirect* in response to the verify endpoint, rather than rendering content, so links cannot be replayed via the browser back button after consumption.
- Bind invitation tokens to a specific email address so that if a recipient forwards the link, an attacker cannot use it under a different account.
- Tokens are stored hashed (SHA-256) so a database leak does not yield usable tokens.

### Alternatives Considered

- **Email + password**: rejected per user choice. Would have required password hashing, reset flows, breach response, lockout policy.
- **OAuth (Google, Microsoft)**: rejected per user choice. Adds redirect-flow complexity and excludes any user without those identities.
- **WebAuthn/passkeys**: rejected as primary mechanism — too immature for cross-company B2B users on varied devices in 2026; could be a v2 enhancement layered onto the magic-link account.

---

## Topic 2: Multi-Tenancy Model — Tenant Discriminator vs. Schema-per-Tenant

### Decision

Use a **shared schema with explicit `leagueId` discriminator** on every league-scoped table.

### Rationale

- v1 scale (50 leagues × 50 members) is well within a single SQLite database.
- Operationally simpler: one migration target, one backup, one connection pool.
- All league-scoped queries take the same shape: `WHERE leagueId = ?` added to every read; index every league-scoped table on `(leagueId, …)` to keep query plans clean.
- Data migration to a Postgres database later (if scale demands it) is straightforward — same schema, different driver.

### Enforcement Strategy

The single biggest risk in this model is a dropped `leagueId` filter leaking another league's data. Mitigations:

1. **Authorisation helper everywhere**: every league-scoped route handler MUST start with `const { leagueId, membership } = await requireLeagueMember(req, params.leagueId)`. The helper resolves the route's `leagueId`, checks the user's `LeagueMembership` (active, role), and returns the canonical `leagueId` to use in queries. Routes that do not call this helper fail the integration tests.
2. **Repository pattern with leagueId required**: `lib/repositories/membership.ts`, `lib/repositories/league.ts` — every query function takes `leagueId` as a required typed parameter. The Prisma client is wrapped in a thin facade that forces this for the league-scoped tables.
3. **Integration test matrix**: for each league-scoped API route, an automated test attempts the request as (a) a member of the route's league (expect 200), (b) a member of a different league (expect 403/404), (c) an unauthenticated request (expect 401). This is the SC-006 verifier.
4. **No implicit "current org"**: the codebase contains no global "current organisation" or "default organisation" lookup. Every read is explicit.

### Alternatives Considered

- **Schema-per-tenant** (separate DB schema or DB per league): rejected — operational overhead per league, painful migrations, overkill for the scale, and SQLite doesn't support multi-schema cleanly.
- **Row-level security (RLS) in the DB**: rejected — SQLite has no native RLS; would force a Postgres migration earlier than necessary. Application-level enforcement is the pragmatic choice for SQLite. RLS is a sound v3 hardening if/when on Postgres.

---

## Topic 3: Identity Model — Decoupling Users from FPL Manager IDs

### Decision

Introduce a `UserAccount` entity (email-keyed identity) separate from `LeagueMembership` (per-league participation). The current `User { managerId, passwordHash }` model is replaced; `managerId` moves onto `LeagueMembership` (per-league membership column).

### Rationale

- An FPL Manager ID is a property of *FPL participation*, not of a person's *platform identity*. A user might exist on the platform without ever having joined a league (e.g., an invited Super Admin who has not yet been added to any league).
- A single user might join the platform via a League Admin invitation before they have ever supplied a Manager ID; identity should not block that.
- Same person, multiple leagues = same `UserAccount.id`, multiple `LeagueMembership` rows. The Manager ID is typically the same on each (a real FPL user has one team), but the model does not assume this — supporting variation is free.
- Email is the natural primary key for cross-league identity because the magic-link flow is email-driven.

### Migration Implication

Existing `User { managerId, passwordHash }` rows are converted to `UserAccount { email, displayName }` rows by reading `Member.email` (already populated for users who have an email). The `passwordHash` is dropped. Any user without an email on the existing `Member` row needs explicit handling — see Topic 6.

### Alternatives Considered

- **Keep `User.managerId` as PK**: rejected — couples identity to FPL, complicates the "multi-league with same person" path, and prevents non-member platform users (Super Admins).
- **Synthetic UUID for users with no email**: rejected — magic-link sign-in requires an email; no email = no sign-in; resolve the missing-email problem at migration time, do not paper over it with a UUID.

---

## Topic 4: League Slug — URL Routing Strategy

### Decision

Use a per-league human-readable slug (e.g., `acme-fpl-2026`) in the URL: `/l/{slug}/standings`, `/l/{slug}/admin/members`, etc. Internally, the slug resolves to a `leagueId` via `lib/authz/league-resolver.ts`.

### Rationale

- Bookmarkable, shareable URLs that survive a user belonging to multiple leagues.
- The slug is derived from the league name on creation (lowercase, hyphenated, deduplicated) and editable by League Admins (slug history table tracks redirects from old slugs).
- League IDs (cuid) are kept private and not put in the URL, removing one trivial enumeration vector.

### Resolver Behaviour

`leagueResolver(slug, userAccountId)`:
1. Look up `League.id` by `slug` (current) or `LeagueSlugHistory.slug` (redirect).
2. If league is `suspended`, return suspension page (unless requester is a Super Admin, who may still administer it).
3. Look up `LeagueMembership { leagueId, userAccountId, isActive: true }`.
4. If no membership and not Super Admin: 404 (intentional — do not reveal league existence to non-members; this satisfies SC-006).
5. Return `{ leagueId, league, membership | null (Super Admin), role }`.

### Alternatives Considered

- **`leagueId` (cuid) in URL**: rejected — ugly, leaks ID format, no advantage.
- **Subdomain per league** (`acme.fplplatform.com`): rejected — operational complexity (DNS, TLS), unclear benefit at this scale, conflicts with v1 single-deploy assumption.

---

## Topic 5: Super Admin Bootstrap

### Decision

A `BOOTSTRAP_SUPER_ADMIN_EMAIL` environment variable, read on application startup, ensures a `UserAccount` exists for that email AND that a `SuperAdmin` row links to it. Idempotent: present at every boot.

### Rationale

- Satisfies FR-015: "documented mechanism to bootstrap or recover the Super Admin role without requiring direct data store access".
- Recovery is the same as bootstrap: edit env var, restart. No DB surgery.
- Explicit: the operator knows exactly which account holds Super Admin without having to query the DB.

### Behaviour Notes

- The bootstrap creates the UserAccount if missing (no email is sent at this point — the user signs in via magic-link when they next need to). Setting `BOOTSTRAP_SUPER_ADMIN_EMAIL=foo@bar.com` does not send foo a notification.
- The variable can list multiple comma-separated emails for redundancy in production.
- Removing the variable does NOT remove existing Super Admins — only adds-or-keeps. Demotion is via the platform admin UI or by a Super Admin running a one-line script.

### Alternatives Considered

- **First-user-to-sign-in is Super Admin**: rejected — fragile (a misdirected first sign-in becomes a security incident), and not idempotent.
- **CLI script**: viable, but env-var bootstrap is simpler operationally and survives container restarts cleanly.

---

## Topic 6: Migration of Existing Energy-Trading Deployment

### Decision

A one-shot `prisma/migrations/002_multi_league/seed.ts` script runs after the schema migration and:

1. Creates the `Platform` row.
2. Reads the existing `Organisation` row → creates a `League` with the same `name`, `miniLeagueId`, `digestPrompt`, `digestCacheGw`, `digestCacheJson`. Generates an initial slug from the name.
3. For each `Member`, creates a `LeagueMembership` row linked to the new league. `managerId`, `displayName`, `teamName`, `source`, `isActive`, `pointsDeductionPerGw`, `addedAt`, `email` carry over.
4. For each `User` (the password-auth users), creates a `UserAccount { email: Member.email, displayName: Member.displayName }`. The `Member`'s LeagueMembership is linked to the new UserAccount via `LeagueMembership.userAccountId`.
5. Drops the `User` table (passwords are not migrated — first sign-in post-migration is via magic-link).
6. Reads `BOOTSTRAP_SUPER_ADMIN_EMAIL` and ensures a UserAccount + SuperAdmin row.
7. Reads `BOOTSTRAP_LEAGUE_ADMIN_EMAIL` env var → upgrades that user's LeagueMembership in the migrated league to role `admin`.
8. Logs all migration actions to `AuditEvent` with `actor: 'migration'`.
9. The script is **idempotent**: running twice does not create duplicates. Detection is by checking for the existence of the migrated League's slug.

### Members Without Email

Some existing `Member` rows have `email: null` (the email column was added later). For those:

- A `LeagueMembership` is created without a linked `UserAccount`. They appear in the league but cannot sign in until either (a) the League Admin fills in their email via the new admin UI, which then triggers an invitation email, or (b) they request the League Admin add them.
- The migration outputs a clear log line per such member so operators can act.

### Industry-Specific Copy Removal

A separate task (tracked in `tasks.md` once `/speckit.tasks` runs) audits all 13 files identified in the codebase that reference "EnergyOne" / "energy trading". These are all narrative/LLM/landing/admin/login copy. Strategy:

- Move every fixed string into `lib/branding/strings.ts` with platform-generic wording.
- LLM prompts (in `narrative`, `horoscope`, `gw-report`, `trash-talk`, `tribunal`) take the `League.name` as a runtime variable and use generic prompt scaffolding ("You are commenting on a fantasy football league called {leagueName}…") instead of "energy trading company".
- Visual branding (colours, default logo) becomes platform-default; League Admins can override the logo per league.

### Rollback Path

The migration is one-way (drops `User.passwordHash`). To roll back, restore from the pre-migration backup. This is acceptable because:

- The existing deployment has a single tenant whose dataset is small.
- An operator-driven backup is taken immediately before running the migration (documented in `quickstart.md`).
- After migration, the new schema is the canonical schema; rollback within hours of migration is supportable from backup, longer-term rollback is not supported (consistent with the spec's "v1, no parallel-run" assumption).

---

## Topic 7: Authorisation Layer — Function Shape

### Decision

A small set of authorisation helpers used by every server-side entry point. Three flavours:

```ts
requireSession(req): { userAccount }            // any signed-in user; 401 if not
requireLeagueMember(req, leagueIdOrSlug):
  { userAccount, league, membership }           // 401 if not signed in, 404 if league not visible, 403 if suspended
requireLeagueAdmin(req, leagueIdOrSlug):
  { userAccount, league, membership }           // adds: 403 if membership.role !== 'admin'
requireSuperAdmin(req):
  { userAccount }                                // 403 if not Super Admin
```

Each helper is pure-async and returns a discriminated union or throws a typed `AuthzError` that the route handler converts to an `ApiResponse<T>` with the standard envelope (per the user's TS patterns rule). The same helpers are usable in Server Components (page loaders) and Route Handlers.

### Rationale

- One code path = one place to audit.
- Combined with the integration test matrix, the helpers make leakage statistically very hard to introduce.
- Mirrors the user's preference for explicit, repository-style boundary enforcement.

---

## Topic 8: Tooling Additions

| Tool | Why |
|------|-----|
| **Zod** (`zod`) | Per the user's TypeScript coding-style rule: schema-based input validation at every API boundary. Used for magic-link request body, invitation creation, league create/update, member add/edit, role-change endpoints. |
| **Playwright** | Cross-league isolation is a feature that is best verified in a real browser (cookies, redirects, server-side rendered league context). Existing project has only Vitest. Adding Playwright for the multi-tenant E2E suite, scoped to the new isolation flows. |
| **Existing nodemailer** | No new dependency — already present. |

No other new dependencies are introduced. The plan deliberately avoids pulling in an authentication library (NextAuth, Lucia, Auth.js, Clerk) because:

- The flows are simple enough to implement without a framework.
- An external service (Clerk, Auth0) violates the v1 "single deployable unit" assumption and adds runtime cost.
- Existing project uses hand-rolled session crypto already; the new code is the same shape, just backed by a Session table instead of HMAC.

If a future maintainer wants to migrate to a library, the `lib/auth/*` boundary is small and replaceable.

---

## Open Items Carried into Phase 2

None of the spec's `[NEEDS CLARIFICATION]` markers remain. All decisions above resolve them or are downstream of the user's Option A choice.

A minor item the implementer should keep in mind: SQLite's default journal mode in production should be `WAL` to reduce write-lock contention as the multi-league workload increases. Configurable via Prisma's `relationMode` and a one-time `PRAGMA journal_mode = WAL;`. Tracked as an implementation note, not a spec ambiguity.

---

# Research Addendum — Multi-League Admin UX Delta (2026-05-13)

This addendum covers a focused UX delta layered on top of the shipped 002 work. The capability "an admin manages more than one league" is already permitted by FR-014 and supported by the data model and authorisation layer; this addendum addresses only the navigation surface.

## Topic A: Where does an admin's "multi-league home" live?

**Decision**: Add a new top-level Server Component page at `/my-admin`. Not nested under `/l/[leagueSlug]/` (it spans leagues) and not nested under `/platform` (that route is Super-Admin only and the feature must work for ordinary League Admins).

**Rationale**:
- The URL must be reachable without a `[leagueSlug]` segment — there is no canonical "current league" in this view.
- `/platform` is gated by `requireSuperAdmin`; a plain League Admin who admins two leagues is not a Super Admin and must not be redirected there.
- The existing `/leagues` chooser is the right "I'm picking a destination" page; `/my-admin` is the "I want to act on every league I admin without picking first" page. Conceptually different.

**Alternatives considered**:
- *Reuse `/leagues` with an admin-section* — rejected because `/leagues` is the chooser for plain navigation and gets hit even by single-league members; loading per-league admin links into it on every visit is wasteful and visually noisy for the common case.
- *Put the admin home inside `/l/[firstAdminLeague]/admin/leagues`* — rejected because the choice of "first" is arbitrary and the URL implies a parent that doesn't really own the view.

## Topic B: Context-preserving switching across admin sub-paths

**Decision**: Introduce a pure routing helper `mapAdminPath(currentPath, targetLeagueSlug, targetRole) → string` and route the LeagueSwitcher through it. When `currentPath` matches `/l/<source>/admin/<sub>` AND `targetRole === 'admin'`, the helper returns `/l/<target>/admin/<sub>`. Otherwise it returns `/l/<target>/standings` (the existing default).

**Rationale**:
- Pure function → table-driven tests, no React-runtime coupling.
- Synchronous → no extra `/api/auth/me` round-trip on dropdown open; the LeagueSwitcher already has the user's full memberships list and roles.
- Targeted scope: only the `/admin/<sub>` case is special. Every other top-level page (`standings`, `live`, `ownership`, etc.) is a Member surface and the existing "go to standings" default is correct.

**Alternatives considered**:
- *Always try to land on the same sub-path regardless of role* (e.g., land on `/l/B/admin/settings` even if user is only a member of B) — rejected: would 403 on render. The helper must consult the *target* role.
- *Server-side redirect handler* — rejected: switching is a client-side action; round-tripping through the server for path mapping is unjustified latency.

## Topic C: How should `/leagues` chooser surface the admin/member split?

**Decision**: When the user has at least one admin membership AND at least one non-admin membership, render two stacked groups: "Leagues you administer" (each row shows inline deep links to the league's admin sub-shell) followed by "Leagues you're a member of" (each row links to `/standings` as today). Single-group users (all-admin or all-member) see a single list — no degenerate empty section.

**Rationale**:
- The split is meaningful only when both sides exist. Forcing the split for an all-admin user adds noise.
- Inline deep links from the admin list to `/admin/settings` / `/admin/members` save a click for the most common follow-up action.
- The Super Admin "Platform admin →" footer remains unchanged from T037.

**Alternatives considered**:
- *Filter chips ("All / Admin / Member")* — rejected as overkill for a list that has at most ~10 rows.
- *Tooltip-on-hover for admin deep links* — rejected: not discoverable on touch devices.

## Topic D: Do we need a new API endpoint?

**Decision**: **No.** `GET /api/auth/me` already returns `memberships[]` with `leagueId`, `leagueSlug`, `leagueName`, `role`, and `isActive` (see `src/app/api/auth/me/route.ts`, refactored by T032). `/my-admin` is a Server Component that calls `getServerUserFromCookie(token)` directly — no fetch round-trip needed.

**Rationale**:
- Adding an endpoint to slice the same data the client already has would duplicate logic and create a second authorisation surface to gate.
- Server-side derivation keeps `/my-admin` consistent with the existing `/leagues` page (also a Server Component).

**Alternatives considered**:
- *Add `GET /api/me/admin-leagues`* — rejected as redundant. Reconsider when (and only when) we ship the option-2/3 cross-league dashboard widgets deferred per the user's scope choice.

## Topic E: Sidebar surface for multi-league admins

**Decision**: When the sidebar renders inside a league shell AND the current user holds admin role on 2+ active leagues, show a single extra "My admin leagues" link near the existing per-league "Admin" entry. Suppress the link for single-league admins (the existing per-league "Admin" entry already covers their need).

**Rationale**:
- Keeps the sidebar uncluttered for the majority of users.
- The signal "I admin multiple leagues" comes from the same `memberships[]` already fetched by `LeagueSwitcher`; no extra cost.
- Placement near the existing "Admin" entry preserves spatial intuition — admin-y things stay together.

**Alternatives considered**:
- *Always show the link, with a "(N)" badge* — rejected: clutter for single-league users who form the majority.
- *Move into the LeagueSwitcher dropdown only* — rejected: discoverability suffers when navigating inside `/l/A/admin/members` and wanting to leap directly to the multi-admin home.

## Topic F: Suspended leagues in the admin list

**Decision**: A suspended league where the user holds admin role is shown in `/my-admin` and `/leagues` with a clear "Suspended" chip and a muted style. Deep links to `/admin/<sub>` are *disabled* (rendered as a non-link span with a tooltip). The only enabled link is back into the league's main shell at `/l/<slug>/`, which already renders the suspended page from `[leagueSlug]/layout.tsx`.

**Rationale**:
- Hiding suspended leagues entirely would let a user "lose" a league they still administer, contradicting FR-022's "data MUST be preserved".
- Disabling admin deep-links matches existing route-level behaviour: `requireLeagueAdmin` throws `LeagueSuspendedError` for non-Super-Admins on suspended leagues, so an enabled link would produce a confusing error.

**Alternatives considered**:
- *Show suspended leagues with full admin links and let the route gate fail* — rejected: poor UX, looks like a broken link.

## Topic G: Super Admin overlap

**Decision**: `/my-admin` only lists leagues where the current user has an explicit `LeagueMembership.role === 'admin'` row. Super Admin status alone does NOT populate the list, even though `requireLeagueAdmin` honours the Super Admin bypass. The Super Admin's own surface is `/platform`, which already provides a richer cross-league dashboard.

**Rationale**:
- Mixing the two would muddy the conceptual distinction between "leagues I admin as a participant" (League Admin role) and "leagues I oversee as platform operator" (Super Admin role).
- A Super Admin who happens to hold a League Admin row on one specific league will see that league listed (correctly) on `/my-admin` and still see all leagues via `/platform`.

**Alternatives considered**:
- *Include all leagues for Super Admins on `/my-admin`* — rejected: duplicates `/platform`'s job and risks Super Admins doing platform-scope work from a weaker UI.
