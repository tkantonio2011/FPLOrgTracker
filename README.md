# FPL Tracker

A multi-tenant Fantasy Premier League companion. Each **league** on the
platform is fully isolated — members, leaderboards, suggestions, and
admin actions never leak across leagues. The platform supports multiple
leagues per deployment, magic-link sign-in, and an audit trail for every
administrative action.

Built with Next.js 14 (App Router), Prisma + SQLite, TanStack Query,
Tailwind CSS, and Recharts.

## Quickstart

For full operator and developer instructions — environment variables,
the migration runbook, the sign-in / invitation / suspension flows, and
the pre-cutover verification checklist — see
[`specs/002-multi-league-platform/quickstart.md`](specs/002-multi-league-platform/quickstart.md).

In short, for a fresh local setup:

```bash
npm install
cp .env.example .env.local            # then set BOOTSTRAP_SUPER_ADMIN_EMAIL
npx prisma db push --skip-generate --accept-data-loss
npm run db:seed                       # idempotent; bootstraps Platform + Super Admin
npm run dev
```

Then visit <http://localhost:3000/sign-in>, enter the email you set as
`BOOTSTRAP_SUPER_ADMIN_EMAIL`, and follow the magic-link printed in the
dev console (SMTP is optional in development).

## Roles

- **Member** — reads their league's leaderboard, performance, ownership,
  and suggestions; never sees another league.
- **League Admin** — manages their league: settings, members, role
  promotion, invitations, FPL sync, audit feed.
- **Super Admin** — manages the platform: onboard new leagues, suspend
  abusive leagues, grant/revoke admin roles, disable user accounts,
  view the platform-wide audit feed.

## Project Structure

```
src/
├── app/
│   ├── (auth)/                     ← magic-link sign-in, invitation acceptance
│   ├── (main)/
│   │   ├── leagues/                ← league switcher
│   │   ├── l/[leagueSlug]/         ← every member-facing page
│   │   │   └── admin/              ← League Admin sub-shell
│   │   └── platform/               ← Super Admin sub-shell
│   └── api/
│       ├── auth/, invitations/     ← session + onboarding
│       ├── leagues/[leagueId]/     ← league-scoped routes
│       └── platform/               ← Super Admin only
├── components/
│   ├── auth/, league/, platform/
│   ├── layout/, landing/
│   └── ui/
└── lib/
    ├── auth/, authz/, audit/
    ├── branding/, repositories/
    ├── http/, validation/
    ├── fpl/, suggestions/, db/
prisma/
├── schema.prisma
└── migrations/002_multi_league/
    ├── migration.sql, seed.ts
    └── rollback.md
```

## Testing

```bash
npm test                 # Vitest unit tests (jsdom)
npm run test:integration # Vitest integration tests (Prisma + temp SQLite)
npm run test:e2e         # Playwright (requires `npx playwright install chromium`)
```

Two structural tests pin the architecture's load-bearing invariants:

- `tests/unit/handlers/authz-coverage.test.ts` — every route under
  `/api/leagues/[leagueId]/*` and `/api/platform/*` MUST call one of
  the `require*` helpers. Adds a regression-proof gate around the
  cross-league isolation rule.
- `tests/unit/branding/no-industry-references.test.ts` — `src/` may not
  contain any hard-coded industry/company references (SC-004 verifier).

## UAT

A separate UAT environment runs alongside production on its own EC2 instance,
gated by an env-var allow-list and visually marked with a yellow banner on
every page. The same release artefacts deploy to either environment.

- Runbook: [`specs/004-uat-deployment/quickstart.md`](specs/004-uat-deployment/quickstart.md)
- Contracts: [`specs/004-uat-deployment/contracts/`](specs/004-uat-deployment/contracts/)
- Operator scripts: [`scripts/uat/README.md`](scripts/uat/README.md)

## Documentation

| Doc | Purpose |
| --- | --- |
| [`specs/002-multi-league-platform/spec.md`](specs/002-multi-league-platform/spec.md) | What the multi-tenant rebuild does and why |
| [`specs/002-multi-league-platform/plan.md`](specs/002-multi-league-platform/plan.md) | Architecture and phasing |
| [`specs/002-multi-league-platform/data-model.md`](specs/002-multi-league-platform/data-model.md) | Schema, entity invariants, audit event catalog |
| [`specs/002-multi-league-platform/quickstart.md`](specs/002-multi-league-platform/quickstart.md) | Operator runbook + dev setup |
| [`specs/002-multi-league-platform/contracts/`](specs/002-multi-league-platform/contracts/) | Auth, league, and platform endpoint contracts |
| [`specs/004-uat-deployment/`](specs/004-uat-deployment/) | UAT environment spec, plan, contracts, runbook |
| [`prisma/migrations/002_multi_league/rollback.md`](prisma/migrations/002_multi_league/rollback.md) | Restore-from-backup procedure |
| [`CHANGELOG.md`](CHANGELOG.md) | Release-by-release history |
