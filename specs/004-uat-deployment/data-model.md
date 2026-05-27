# Phase 1 — Data Model: UAT / Test Environment

**Feature**: 004-uat-deployment
**Date**: 2026-05-21

This feature does **not** add Prisma models, migrations, or schema changes. The "entities" in `spec.md` are configuration surfaces, not persisted rows. This document records the shape of those configuration surfaces and the runtime invariants that gate behaviour on them.

If `/speckit.tasks` expects this file to be empty when no schema changes occur, treat the sections below as "configuration models" — they describe the new in-memory typed objects introduced in `src/lib/uat/`.

---

## Configuration model 1 — `EnvironmentConfig`

In-memory, loaded once at module init.

| Field | Type | Source | Validation | Notes |
|---|---|---|---|---|
| `name` | `"production" \| "uat" \| "development"` | `process.env.APP_ENV` | Zod enum; default `"development"` | Any other value throws at startup. |
| `isUat` | `boolean` (derived) | derived from `name` | — | `name === "uat"`. |
| `appUrl` | `string` (URL) | `process.env.APP_URL` | Zod URL, no trailing slash enforced | Used in magic-link bodies; UAT value is `http://<UAT-EIP>/`. |

**Identity**: One instance per Node process. Frozen object after construction.

**Lifecycle**: Created on first import of `src/lib/uat/environment.ts`. Never updated — process restart required for change (matches the env-var clarification).

**Invariants**:
- `name === "uat"` ⇔ `APP_URL` host part ≠ production's host part. Asserted in a startup self-check; failure logs a warning but does not refuse startup, since the URL is also valid as a developer's localhost.
- `name === "production"` ⇒ `UatAllowList` MUST be unset or empty (FR-009 final sentence). Asserted at startup; failure refuses startup.

---

## Configuration model 2 — `UatAllowList`

In-memory, loaded once at module init.

| Field | Type | Source | Validation | Notes |
|---|---|---|---|---|
| `emails` | `ReadonlySet<string>` | `process.env.UAT_ALLOWED_EMAILS` | Each entry: `z.string().trim().toLowerCase().email()` | Deduplicated. Empty / unset is illegal when `EnvironmentConfig.name === "uat"`. |

**Identity**: One instance per Node process; lives only when `EnvironmentConfig.isUat === true`.

**Lifecycle**: Created at first import of `src/lib/uat/allowlist.ts`. Never mutated. Process restart re-reads the env var.

**Invariants**:
- For every `e ∈ emails`: `e.toLowerCase().trim() === e` (canonical form).
- When `EnvironmentConfig.name === "uat"`: `emails.size >= 1` (FR-009 — UAT with empty allow-list refuses to start).
- When `EnvironmentConfig.name === "production"`: the module is never imported (a code-level invariant; the magic-link route conditionally requires it only inside `isUat()` guards).

**State transitions**: none — config object is immutable.

---

## Configuration model 3 — `SnapshotInventory`

On-disk under `/home/ec2-user/backups/uat/`. Not a runtime object; consumed by shell scripts only. Documented here so the data-shape and retention policy are auditable.

| Slot | Path | When written | When read |
|---|---|---|---|
| `current` | `/home/ec2-user/backups/uat/current/uat.db` | After every successful refresh (a copy of the freshly applied snapshot) and at deploy time | — |
| `previous` | `/home/ec2-user/backups/uat/previous/uat.db` | Before a new deploy overwrites `current/` | By `scripts/uat/rollback.sh` (deploy rollback) |
| `pre-refresh` | `/home/ec2-user/backups/uat/pre-refresh/uat.db` | Before a refresh-from-prod overwrites `current/` | By `scripts/uat/rollback.sh --refresh` (refresh rollback) |

**Identity**: One file per slot. Filenames fixed; no timestamp suffixes — keeps `rollback.sh` deterministic.

**Lifecycle**:
- Slots are created on first deploy / first refresh.
- Files are `chmod 600`, owner `ec2-user`.
- No file is removed during normal operation; only overwritten by rotation. (Reason: deletion + write is two operations, and an interrupted run could leave the slot empty.)

**Invariants** (FR-019):
- At least one of `{previous, pre-refresh}` MUST exist if `current` exists.
- Total disk footprint: 3 × max(uat.db size). Production db is currently < 50 MB, comfortably within the EBS volume size.

---

## Configuration model 4 — `UatBootstrapState`

Not a new persistent entity. It is the **effective Super-Admin grant** in the UAT database after the bootstrap mechanism in `src/lib/auth/bootstrap.ts` (existing code) has run.

Captured here because FR-022 makes the behaviour observable, and the refresh procedure (R7) depends on it:

| Field | Type | Source | Notes |
|---|---|---|---|
| `bootstrapEmail` | `string` (email) | `BOOTSTRAP_SUPER_ADMIN_EMAIL` env var | UAT value MUST differ from production value (FR-012). |
| `effectiveSuperAdminEmails` | `Set<string>` (derived from DB) | `UserAccount` rows with `isSuperAdmin: true` | Post-refresh, post-bootstrap, MUST equal exactly `{ bootstrapEmail }` (FR-022). |

**Refresh-time invariant**: Immediately after `scripts/uat/refresh-from-prod.sh` completes, before the PM2 restart, `effectiveSuperAdminEmails` equals the production set (because UAT now holds a copy). After the PM2 restart and the bootstrap pass, `effectiveSuperAdminEmails === { bootstrapEmail }`. This is what makes the refresh + restart sequence safe.

---

## Sequence: refresh-from-production

```
Operator laptop                Production EC2              UAT EC2
─────────────────────          ──────────────────          ─────────────────────
                                                           SnapshotInventory.pre-refresh ← current  (rotate)
SSH → "sqlite3 .backup"        backup prod.db → /tmp/...
scp ← prod-snapshot.db
                                                           scp → uat host
                                                           atomic mv → SnapshotInventory.current
                                                           sqlite3 < cleanup.sql
                                                              DELETE FROM magic_link_tokens;
                                                              DELETE FROM sessions;
                                                              UPDATE user_accounts SET is_super_admin = 0
                                                                  WHERE email != $BOOTSTRAP_SUPER_ADMIN_EMAIL;
                                                           pm2 restart fpl-tracker
                                                              (bootstrap.ts re-grants Super Admin
                                                               to BOOTSTRAP_SUPER_ADMIN_EMAIL)
```

The bootstrap pass that runs after the restart is the existing platform behaviour — not new code. Re-using it is what keeps FR-022 testable without adding a UAT-only code path (FR-006).

---

## What this feature explicitly does **not** add

- No new Prisma model.
- No new migration.
- No new database table.
- No new column on any existing model.
- No new index.

If a reviewer expects schema diffs, there are none — that is the explicit design choice. All UAT-specific state is held in:
1. Env vars (R1, R2, R11),
2. The on-disk snapshot directory (R10),
3. The unchanged production schema running against a separate SQLite file.
