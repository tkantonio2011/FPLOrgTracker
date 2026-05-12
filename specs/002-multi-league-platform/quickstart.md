# Quickstart: Multi-League Platform

**Branch**: `002-multi-league-platform`
**Date**: 2026-05-08

This is the operational and developer guide for the multi-tenant rebuild of the FPL tracker. It supplements `001-fpl-org-tracker/quickstart.md`; the FPL API integration, suggestion algorithms, and TanStack Query strategy carry over from 001 unchanged.

---

## What Changes Compared to 001

- **Tenancy**: the singleton "Organisation" becomes "League" — many leagues per deployment, fully isolated.
- **Identity**: passwords are gone; sign-in is a one-time emailed magic-link.
- **Roles**: three roles — Member (read), League Admin (manages a league), Super Admin (manages the platform).
- **URLs**: every member-facing page now lives under `/l/{leagueSlug}/...`. The platform admin area lives at `/platform/...`. Auth pages stay at `/sign-in`, `/verify`, `/invitations/{token}`.
- **Branding**: industry/company-specific copy is gone. Each league configures its own name and logo.

---

## Project Structure (post-migration)

```
fpl-org-tracker/                      ← repo root (name kept; could be renamed in v2)
├── src/
│   ├── app/
│   │   ├── (auth)/
│   │   │   ├── sign-in/page.tsx                ← magic-link request
│   │   │   ├── verify/page.tsx                 ← token consumer
│   │   │   └── invitations/[token]/page.tsx    ← invitation acceptance
│   │   │
│   │   ├── (main)/
│   │   │   ├── leagues/page.tsx                ← switcher when user is in >1 league
│   │   │   ├── l/[leagueSlug]/                 ← every member-facing page nested here
│   │   │   │   ├── layout.tsx                  ← LeagueContext, isolation guard
│   │   │   │   ├── page.tsx, standings, members, suggestions, ownership,
│   │   │   │   ├── live, h2h, agony, bench, captain-history, captain-whatif,
│   │   │   │   ├── differentials, form, luck, player-status, regret, season-stats,
│   │   │   │   ├── transfers, ...
│   │   │   │   └── admin/
│   │   │   │       ├── settings, members, audit
│   │   │   │
│   │   │   └── platform/                       ← Super Admin only
│   │   │       ├── layout.tsx                  ← SuperAdmin guard
│   │   │       ├── leagues, users, audit
│   │   │
│   │   └── api/
│   │       ├── auth/             ← magic-link, verify, logout, me
│   │       ├── invitations/      ← issue, lookup, accept
│   │       ├── leagues/[leagueId]/   ← scoped routes (see contracts/scoped-route-contracts.md)
│   │       └── platform/         ← Super Admin only
│   │
│   ├── components/
│   │   ├── auth/, league/, platform/
│   │   ├── layout/                              ← AppShell now reads LeagueContext
│   │   └── (existing standings/, performance/, suggestions/, ownership/, ui/)
│   │
│   └── lib/
│       ├── auth/                                 ← magic-link, session, current-user, email
│       ├── authz/                                ← league-scope, platform-scope, league-resolver
│       ├── audit/                                ← log
│       ├── branding/                             ← strings.ts (generic copy constants)
│       ├── repositories/                         ← typed, leagueId-required data access
│       ├── http/                                 ← ok/fail envelope helpers
│       ├── validation/                           ← Zod schemas
│       ├── fpl/, suggestions/, db/, cache.ts     ← unchanged
│
└── prisma/
    ├── schema.prisma                              ← new models
    └── migrations/002_multi_league/
        ├── migration.sql
        └── seed.ts                                ← idempotent data migration
```

---

## Core Flows

### 1. First-Time Platform Boot (Operator)

1. Set `BOOTSTRAP_SUPER_ADMIN_EMAIL=ops@yourco.com` in env.
2. Set `SMTP_*` env vars (or leave unset for dev — links print to console).
3. Run `npx prisma migrate deploy`.
4. Run `npm run db:seed` (executes the 002 migration script idempotently).
5. Start the app: `npm run start`.
6. Operator visits `/sign-in`, enters `ops@yourco.com`, receives magic-link, signs in, lands on `/platform`.
7. From `/platform`, operator creates the first league (or — if upgrading an existing deployment — finds the migrated league already there).

### 2. Onboarding a New League (Super Admin)

1. Super Admin → `/platform/leagues/new`.
2. Enter league name, optionally slug/logo/mini-league ID, and the initial League Admin's email.
3. Submit → backend creates `League`, `LeagueMembership` (admin), and an Invitation; magic-link emailed.
4. League Admin clicks the link, lands on `/invitations/{token}`, optionally fills in their FPL Manager ID, accepts → signed in, redirected to `/l/{slug}/admin/settings`.
5. League Admin enters mini-league ID (if not pre-supplied), clicks "Sync members" → all FPL managers in that mini-league appear as members. Members do NOT receive emails at this point — they exist as memberships without UserAccounts until invited.
6. League Admin invites members by email from `/l/{slug}/admin/members`.

### 3. Member Sign-In

1. Member visits any URL on the platform.
2. If not signed in → redirected to `/sign-in`, enters their email.
3. If they have a UserAccount → magic-link sent; they click it → signed in, redirected to the URL they tried to reach (or to `/leagues` if they belong to multiple leagues, or directly to their single league's `/standings`).
4. If they have no UserAccount → no link is sent (silent), and the form shows the same generic "if an account exists, we sent a link" message. Real onboarding requires an invitation.

### 4. Multi-League Member Switching

1. Member belongs to League A and League B.
2. Top-bar "League" badge shows the current league name + logo and is clickable.
3. Click → dropdown lists all leagues the user is in; selecting one navigates to `/l/{otherSlug}/standings`.
4. Bookmarks always include the league slug; sharing a URL with another member who is in the same league works as expected, and with someone who is not → 404 (intentional non-disclosure).

### 5. Suspending a League (Super Admin)

1. Super Admin → `/platform/leagues/{leagueId}` → "Suspend".
2. Confirm + optional reason.
3. Members of that league next page-load see a "This league is suspended" message; League Admin sees the same.
4. Super Admin can reinstate at any time; data is preserved.

### 6. Migration Day (Existing Deployment Upgrade)

1. **Before deploy**: take a SQLite backup (`cp prisma/dev.db prisma/dev.db.pre-002`). Keep this file — it is the rollback path. See `prisma/migrations/002_multi_league/rollback.md`.
2. **Set env**: `BOOTSTRAP_SUPER_ADMIN_EMAIL`, `BOOTSTRAP_LEAGUE_ADMIN_EMAIL` (the existing deployment's primary admin), `SMTP_*`.
3. **Deploy** the new build.
4. Apply the schema and run the seed:
   - This codebase manages its schema with `prisma db push` (no migration history exists yet) — run `npx prisma db push --skip-generate --accept-data-loss`. The schema is expand-only: legacy `Organisation` / `Member` / `User` tables are left in place; new tables are added alongside. No existing row is modified by the schema push itself.
   - Run `npm run db:seed` (executes `tsx prisma/migrations/002_multi_league/seed.ts`). The seed is idempotent — re-running it does nothing if the org has already been migrated (detected via the `migration.completed` AuditEvent that carries `legacyOrgId`).
5. Confirm in the app: visit `/sign-in`, enter the bootstrap super-admin email, follow the magic-link, verify the migrated league appears in `/platform/leagues` with all historical members.
6. Notify members: "We've moved to passwordless sign-in. Visit /sign-in and enter your work email."

---

## Environment Variables

```
# Database
DATABASE_URL="file:./dev.db"

# Sessions / cookies
SESSION_COOKIE_NAME="session"          # optional override
SESSION_TTL_DAYS="30"                  # optional override

# Auth bootstrap
BOOTSTRAP_SUPER_ADMIN_EMAIL="ops@yourco.com"           # required in production
BOOTSTRAP_LEAGUE_ADMIN_EMAIL="admin@migrated-league"   # required during 002 migration only

# SMTP (required in production; optional in dev — falls back to console log)
SMTP_HOST="smtp.example.com"
SMTP_PORT="587"
SMTP_USER="apikey"
SMTP_PASSWORD="…"
SMTP_FROM="FPL Tracker <noreply@yourdomain>"

# Existing — unchanged
GROQ_API_KEY="…"  # for narrative/horoscope/gw-report features (LLM)
```

The previous `ADMIN_PIN` and any password-related secrets are no longer used and can be removed.

---

## Development Setup

```bash
# Fresh clone
npm install
cp .env.example .env.local           # then fill in BOOTSTRAP_SUPER_ADMIN_EMAIL etc.
npx prisma migrate dev --name init    # for fresh DB
npm run db:seed                       # idempotent — creates Platform, bootstraps SuperAdmin
npm run dev

# Sign in as the bootstrap super admin
# 1. Open http://localhost:3000/sign-in
# 2. Enter the email matching BOOTSTRAP_SUPER_ADMIN_EMAIL
# 3. Watch the dev console for "DEV MODE — magic link: http://…/verify?token=…"
# 4. Open the link → signed in → redirected to /platform
```

For an upgrade from an existing 001-shaped DB, run `npm run db:seed` after `npx prisma db push --skip-generate --accept-data-loss` — it detects the existing single Organisation and converts it to the first League.

---

## Verification Checklist Before Cutover

- [ ] `npm test` passes (existing + new auth/authz/migration tests).
- [ ] `npm run test:e2e` (Playwright) passes — cross-league isolation suite green.
- [ ] Migration dry-run: copy production DB to staging, run `db:seed`, confirm member counts and league configuration match pre-migration values exactly.
- [ ] Grep verification: `git grep -i "energy.trading\|EnergyOne"` returns no matches in `src/`, `prisma/`, or any user-facing template.
- [ ] SMTP credentials verified by sending a test magic-link to the operator.
- [ ] Backup taken and stored separately.
- [ ] Communication drafted to existing members about the auth change.

---

## Key Technical Notes (carries over from 001 + new)

### From 001 (unchanged)
- FPL API CORS — all FPL fetches go through server-side route handlers.
- TanStack Query for client cache; `next/cache` `revalidate` for server cache.
- Suggestion engine is stateless and runs on each request.

### New for 002
- **Authorisation helpers are mandatory at every entry point**. A handler under `/api/leagues/[leagueId]/` that does not call `requireLeagueMember` or `requireLeagueAdmin` MUST fail integration tests.
- **Zod-validated input at every boundary** — no untyped `req.json()` reaching repositories.
- **Audit logging**: every administrative action is logged via `lib/audit/log.ts`. The simplest rule is: if it goes through a `requireLeagueAdmin` or `requireSuperAdmin` gate, it should also log an AuditEvent (read-only admin reads excluded).
- **No implicit "current org"**. Anywhere the old code referenced "the organisation" implicitly — particularly in LLM prompt construction and email copy — it must now read `League.name` from a per-request `LeagueContext`.
- **Magic-link only**. There is no password column anywhere in the schema. The only credential the system stores is a hash of an in-flight magic-link token (15 min lifetime) and a hash of an active session token (30 day sliding lifetime).

---

## What Is NOT in This Phase

- Self-service league creation by non-Super-Admins. (Operator-driven only in v1.)
- Custom domains per league.
- Theming beyond name + logo.
- Cross-league analytics or leaderboards.
- Billing / paid plans.
- WebAuthn / passkeys / OAuth providers.
- Localisation.
- Mobile app.

These are deliberate v1 cutoffs. Each was considered and deferred — see `research.md` and `spec.md` Assumptions for the full list.
