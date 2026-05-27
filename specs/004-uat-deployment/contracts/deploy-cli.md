# Contract: UAT operator CLI

**Feature**: 004-uat-deployment
**Date**: 2026-05-21

This contract specifies the invocation surface, environment, side effects, and exit codes for every UAT-related shell script. The scripts live under `scripts/uat/` and are run on the operator's laptop (WSL or Git Bash on Windows; the build host).

The existing production deploy at `scripts/deploy.sh` is left in place — the new UAT scripts thinly wrap it (per research R6).

---

## `scripts/uat/deploy.sh`

**Purpose**: Deploy the current local build to the UAT EC2 instance.

**Invocation**:
```bash
bash scripts/uat/deploy.sh                 # full: build then deploy
bash scripts/uat/deploy.sh --skip-build    # deploy a pre-built .next/standalone
```

**Required files**:
- `.env.uat` in repo root (gitignored — operator-maintained)
- `terraform/recovery-key.pem` (already exists for production)
- A successful `terraform apply` has set `output.uat_public_ip`

**Pre-flight checks** (exit non-zero if any fail):
1. `.env.uat` exists.
2. `.env.uat` contains `APP_ENV=uat`.
3. `.env.uat` contains `UAT_ALLOWED_EMAILS=` with at least one non-empty email.
4. `.env.uat` contains `BOOTSTRAP_SUPER_ADMIN_EMAIL=` and the value differs from the value in `.env.production`.
5. `.env.uat` contains `SESSION_SECRET=` and the value differs from `.env.production`.
6. `output.uat_public_ip` resolves successfully.

**Side effects**:
- Rsyncs `.next/standalone`, `.next/static`, `public/`, and `prisma/` to `ec2-user@<UAT-EIP>:/home/ec2-user/app/`.
- Uploads `.env.uat` to `/home/ec2-user/app/.env.local` on UAT (note: file is named `.env.local` on the server for Next.js — same convention as production).
- Runs `prisma migrate deploy` on UAT against `uat.db`.
- Writes a PM2 ecosystem config that hard-codes `DATABASE_URL=file:/home/ec2-user/app/prisma/uat.db` and `APP_ENV=uat`.
- Restarts PM2.
- Calls `scripts/uat/smoke-test.sh` at the end. If smoke test fails, exits non-zero with the failing check named.

**Does NOT**:
- Bump version or stamp CHANGELOG (those are production-deploy concerns).
- Touch the production EC2 instance, IP, or database.

**Exit codes**:
- `0` — deploy and smoke test succeeded.
- `1` — pre-flight check failed.
- `2` — upload / SSH error.
- `3` — `prisma migrate deploy` failed.
- `4` — smoke test failed (deploy completed but app is not healthy).

---

## `scripts/uat/refresh-from-prod.sh`

**Purpose**: Replace UAT's database with a fresh copy of production's, then clear sessions and magic-link tokens so production credentials cannot bypass the UAT allow-list.

**Invocation**:
```bash
bash scripts/uat/refresh-from-prod.sh
```

(No flags. Confirmation prompt only — the operator types `REFRESH` to proceed. CI-style auto-confirm is intentionally not provided; this is an interactive ritual.)

**Required files**:
- `terraform/recovery-key.pem`
- `.env.uat` (used to read the UAT `BOOTSTRAP_SUPER_ADMIN_EMAIL` value, which becomes the only Super Admin post-refresh)

**Pre-flight checks**:
1. Both `output.public_ip` (production) and `output.uat_public_ip` resolve.
2. SSH to both hosts succeeds.
3. Production database file exists at the expected path.

**Side effects** (in order):
1. On UAT: rotate `current/` → `pre-refresh/` under `/home/ec2-user/backups/uat/`.
2. On production: `sqlite3 /home/ec2-user/app/prisma/prod.db ".backup /tmp/prod-snapshot-<timestamp>.db"`.
3. `scp` snapshot from production to operator laptop.
4. `scp` from laptop to UAT, into `/home/ec2-user/backups/uat/current/uat.db`.
5. On UAT, atomically move `current/uat.db` → `/home/ec2-user/app/prisma/uat.db` (via temp + `mv`).
6. On UAT, run the cleanup SQL:
   ```sql
   DELETE FROM magic_link_tokens;
   DELETE FROM sessions;
   UPDATE user_accounts SET is_super_admin = 0
     WHERE email != '<value of UAT BOOTSTRAP_SUPER_ADMIN_EMAIL>';
   ```
7. On UAT, `pm2 restart fpl-tracker`. The existing `src/lib/auth/bootstrap.ts` re-grants Super Admin to the UAT `BOOTSTRAP_SUPER_ADMIN_EMAIL` on first request.
8. Print a summary: source snapshot file name, row counts before/after for `magic_link_tokens` and `sessions`, the email that holds Super Admin after refresh.

**Does NOT**:
- Touch the production database (only reads it via `.backup`).
- Sanitise member content, league names, or audit payloads. (Per the spec clarification.)
- Delete the `pre-refresh/` slot.

**Idempotency** (FR-016): Running twice in a row leaves UAT in the same state as running once with a slightly newer production snapshot. Both runs rotate snapshots into the same slots; nothing accumulates.

**Exit codes**:
- `0` — refresh complete; PM2 reports running; row counts match expected.
- `1` — pre-flight check failed.
- `2` — SSH / scp failure.
- `3` — `sqlite3 .backup` on production failed.
- `4` — cleanup SQL on UAT failed.
- `5` — PM2 restart failed or app did not come back healthy.

---

## `scripts/uat/snapshot.sh`

**Purpose**: Take a UAT-only point-in-time snapshot of `uat.db`. Called automatically by `deploy.sh` and `refresh-from-prod.sh` for their respective rotations; can also be run by hand before any risky tester activity.

**Invocation**:
```bash
bash scripts/uat/snapshot.sh                # default: rotate current → previous
bash scripts/uat/snapshot.sh --pre-refresh  # rotate current → pre-refresh
```

**Side effects**:
- On UAT: `sqlite3 /home/ec2-user/app/prisma/uat.db ".backup /tmp/uat-snapshot-<timestamp>.db"`.
- Rotate slots according to the flag.

**Exit codes**: `0` success, `2` SSH error, `3` sqlite3 error.

---

## `scripts/uat/rollback.sh`

**Purpose**: Restore the previous build and/or the previous UAT database snapshot.

**Invocation**:
```bash
bash scripts/uat/rollback.sh             # restore previous .next AND previous uat.db
bash scripts/uat/rollback.sh --code      # restore previous .next only (db kept)
bash scripts/uat/rollback.sh --data      # restore previous uat.db only (code kept)
bash scripts/uat/rollback.sh --refresh   # restore pre-refresh uat.db (undo last refresh)
```

**Pre-flight checks**:
1. The requested slot exists on UAT (e.g., `--refresh` requires `pre-refresh/uat.db`).
2. SSH to UAT succeeds.

**Side effects**:
- Restore `.next/standalone.previous` → `.next/standalone` (if `--code` or no flag).
- Restore `previous/uat.db` → `app/prisma/uat.db` (if `--data` or no flag).
- Restore `pre-refresh/uat.db` → `app/prisma/uat.db` (if `--refresh`).
- `pm2 restart fpl-tracker`.
- Run `scripts/uat/smoke-test.sh`.

**Does NOT touch production** (FR-018).

**Time budget** (SC-004): The script must complete in < 15 minutes including the smoke test. In practice the long pole is the smoke test (~30s); the file moves are seconds.

**Exit codes**:
- `0` — restore + smoke test succeeded.
- `1` — requested slot missing.
- `2` — SSH error.
- `4` — smoke test failed after restore.

---

## `scripts/uat/smoke-test.sh`

**Purpose**: Verify a deployed UAT instance is healthy. Used by both `deploy.sh` and `rollback.sh` automatically; also runnable on demand.

**Invocation**:
```bash
bash scripts/uat/smoke-test.sh
```

**Checks** (per research R13):
1. `GET http://<UAT-EIP>/sign-in` returns 200 and HTML contains the string "UAT environment".
2. `GET http://<UAT-EIP>/` returns 200 and HTML contains the string "UAT environment".
3. `curl -I http://<UAT-EIP>/sign-in` shows `X-Robots-Tag: noindex, nofollow`.
4. `POST http://<UAT-EIP>/api/auth/magic-link` with `{"email":"nobody-on-allowlist@invalid.test"}` returns 200 and `{"sent":true}`.
5. SSH to UAT and `sqlite3 uat.db "SELECT COUNT(*) FROM magic_link_tokens WHERE email='nobody-on-allowlist@invalid.test'"` returns 0.
6. `POST http://<UAT-EIP>/api/auth/magic-link` with the first email from `UAT_ALLOWED_EMAILS` returns 200 and `{"sent":true}`.
7. The same `sqlite3` query for that email returns exactly 1.

**Exit codes**:
- `0` — all 7 checks pass.
- `4` — at least one check failed; the script lists which check(s) and why.

**Output format**: Plain text, one line per check, marked `[PASS]` or `[FAIL]`. The operator should be able to read it in 10 seconds.

---

## Production safety contract (binding all scripts)

Every UAT script in this directory must satisfy:

1. **Never SSH to the production host except** in `refresh-from-prod.sh`, and there only to read `prod.db` via `sqlite3 .backup`. No script writes to production.
2. **Never run `prisma migrate` against production**.
3. **Never modify the production Elastic IP, security group, or AMI**.
4. **Never read or upload `.env.production`** — the UAT scripts use `.env.uat` exclusively.
5. **Always assert `APP_ENV=uat`** in the env file being uploaded. The deploy script grep-checks for this.

These rules are enforceable by inspection — every script begins with a comment block restating them, and a CI check (out of scope for this feature but flagged in tasks) can grep for forbidden constructs (`prod.db` write, `aws_instance.app` references, etc.).
