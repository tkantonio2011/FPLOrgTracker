# 002 Multi-League — Rollback

This migration is **expand-only** by design. The legacy `Organisation`,
`Member`, and `User` tables are not dropped or renamed; new multi-tenant
tables (`Platform`, `League`, `LeagueMembership`, `UserAccount`,
`SuperAdmin`, `MagicLinkToken`, `Session`, `Invitation`, `AuditEvent`,
`LeagueSlugHistory`) are added alongside them. The data migration
(`seed.ts`) reads the legacy rows and writes the new ones; it never
modifies or deletes legacy rows.

This means: **rollback is restore-from-backup**, not "run the migration in
reverse". A reverse-migration script would have to delete the new tables
and their rows, which is high-risk if any production traffic has touched
them.

---

## Rollback Procedure

### Prerequisite

You took the SQLite backup before running the migration, as instructed in
`quickstart.md` section 6 step 1:

```bash
cp prisma/dev.db prisma/dev.db.pre-002
```

If you did not, see "If you have no backup" below.

### Steps

1. **Stop the new build.** Otherwise it will keep writing to the DB and
   diverge further from the backup. On the deployment host:

   ```bash
   pm2 stop fpl-org-tracker   # or however the process is supervised
   ```

2. **Restore the backup over the working DB.**

   ```bash
   cp prisma/dev.db prisma/dev.db.post-002   # keep a copy of the failed state
   cp prisma/dev.db.pre-002 prisma/dev.db
   ```

3. **Deploy the previous (pre-002) build.** The new schema is forward-
   compatible (additive) but the new application code expects the new
   tables to be populated; running it against the restored DB will fail
   the magic-link sign-in flow.

4. **Restart.**

   ```bash
   pm2 start fpl-org-tracker
   ```

5. **Confirm.** Sign in with the legacy admin PIN flow. Check member
   counts in the legacy admin page match the pre-migration state.

The new tables on the restored DB are absent (because the backup was
taken before `prisma db push --accept-data-loss`). No cleanup needed.

### Time budget

Each step is a few seconds. Total rollback window from "decision to
rollback" to "users signing back in": typically under 5 minutes, dominated
by deploy-rollback wait time.

---

## Why no "reverse migration" script

A reverse script would have to:
1. Delete all `Session`, `MagicLinkToken`, `Invitation`, `AuditEvent`,
   `LeagueMembership`, `LeagueSlugHistory`, `League`, `UserAccount`,
   `SuperAdmin`, `Platform` rows.
2. Drop the new tables.

The risk: if the new platform has been live and users have signed in via
magic-link, deleting `UserAccount` and `Session` rows discards their
session state. If they've created leagues, those are lost. The legacy
`Organisation`/`Member`/`User` rows are intact and authoritative, so
restoring from backup is uniformly safe — there is no scenario where the
backup is "older than the current state of the legacy rows," because the
new code does not write to legacy tables.

If a rollback is needed **after significant new-platform activity**,
treat that activity as lost and accept the restore. There is no path that
preserves both old and new state.

---

## If you have no backup

This is the bad case. Options, in order of preference:

1. **Roll forward instead.** The bug you are rolling back from is usually
   smaller than the cost of fabricating a clean legacy state. Fix forward
   on the new schema.

2. **Reconstruct from the legacy tables.** They are still present and
   unmodified. Stand up an instance of the 001-shaped build pointed at the
   live DB — it will read `Organisation`/`Member`/`User` as before. The
   new tables are ignored. Members log in via the legacy PIN flow.
   Note that any UserAccount-only activity from the new build (e.g. a
   member onboarded via invitation but with no legacy `Member` row) is
   not visible to the 001 build.

3. **Restore from an off-site backup** (cloud snapshot, replicated DB,
   etc.) if your deployment maintains one. The off-site backup may
   pre-date the migration even without a deliberate `dev.db.pre-002`
   copy.

---

## Cleanup of the backup file

Once the new platform has been stable for a release cycle, you can remove
`prisma/dev.db.pre-002`:

```bash
rm prisma/dev.db.pre-002
```

This is also the point at which the **contract migration** (drop legacy
`Organisation` / `Member` / `User` tables) can be run. Once the contract
migration lands, rollback is no longer possible — the legacy schema has
been removed from the codebase. Take a fresh backup before running the
contract migration, regardless.
