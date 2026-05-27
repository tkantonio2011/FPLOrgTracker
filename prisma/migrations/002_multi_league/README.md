# 002 Multi-League Platform — Migration

Two-step expand-then-contract migration that converts the single-tenant
deployment into a multi-tenant platform with zero data loss.

## Files

- `migration.sql` — **Expand** SQL: adds the new platform/league/auth tables.
  Does NOT touch the existing `organisations` / `members` / `users` tables.
- `seed.ts` — **Data migration**: copies `Organisation` → `League`,
  `Member` → `LeagueMembership`, `User` → `UserAccount`. Idempotent.
- `rollback.md` — restore from backup if anything goes wrong.

A separate **contract** migration (drops the legacy tables) lands in a later
folder once the seed has been verified against real data and the route
migration in Phase 3 is complete.

## Apply order — existing deployment

```powershell
# 1. BACKUP first. Non-negotiable.
Copy-Item prisma\dev.db prisma\dev.db.pre-002

# 2. Apply expand SQL.
sqlite3 prisma\dev.db < prisma\migrations\002_multi_league\migration.sql

# 3. Set bootstrap env vars (see .env.example for full list)
#    BOOTSTRAP_SUPER_ADMIN_EMAIL, BOOTSTRAP_LEAGUE_ADMIN_EMAIL
#    Then run the seed:
npm run db:seed

# 4. Verify before moving on:
#    - Sign in via /sign-in works for the bootstrap super-admin email
#    - The migrated league is listed in /platform/leagues
#    - Member counts in the migrated league match the pre-migration count
```

## Apply order — fresh deployment

```powershell
# Just push the schema and seed — no legacy data to copy.
npx prisma db push
npm run db:seed
```

The seed is idempotent: it will create the Platform row and bootstrap a
SuperAdmin from `BOOTSTRAP_SUPER_ADMIN_EMAIL` without trying to migrate any
non-existent legacy data.

## Notes

- `prisma migrate` is **not** the recommended apply mechanism for this
  particular migration because the project has been managed via `prisma db
  push` and there is no existing migration history to baseline against. The
  raw SQL file above is the canonical artefact; future migrations can be
  managed via `prisma migrate` once a baseline is established.
- The expand SQL is intentionally additive only — applying it against a
  database that already has the legacy tables will leave them unchanged.
