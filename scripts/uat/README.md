# scripts/uat — UAT operator scripts

Every script in this directory targets the **UAT** EC2 instance — never production.
See the contracts and runbook for the full surface:

- Contract: [`specs/004-uat-deployment/contracts/deploy-cli.md`](../../specs/004-uat-deployment/contracts/deploy-cli.md)
- Runbook: [`specs/004-uat-deployment/quickstart.md`](../../specs/004-uat-deployment/quickstart.md)

## Scripts

| Script | Purpose |
| --- | --- |
| `deploy.sh` | Build (or skip-build) and deploy the current artefacts to UAT. Runs the smoke test on completion. |
| `refresh-from-prod.sh` | Replace `uat.db` with a fresh copy of `prod.db`; clear sessions, magic-link tokens, and non-bootstrap Super Admin grants. Idempotent. |
| `snapshot.sh` | Take a `uat.db` snapshot, rotating slots under `/home/ec2-user/backups/uat/`. |
| `rollback.sh` | Restore previous build and/or previous `uat.db` snapshot. Production is never touched. |
| `smoke-test.sh` | Seven HTTP + DB checks confirming a UAT deploy is healthy. |
| `cleanup.sql` | The SQL applied by `refresh-from-prod.sh` after copying production data. |
| `lint-safety.sh` | Pre-merge guard — fails if any script in this directory references prod write-mode operations. |

## Production safety contract

Every script in this directory must satisfy (per `contracts/deploy-cli.md`):

1. **Never SSH to the production host except** in `refresh-from-prod.sh`, and there only to read `prod.db` via `sqlite3 .backup`.
2. **Never run `prisma migrate` against production.**
3. **Never modify the production Elastic IP, security group, or AMI.**
4. **Never read or upload `.env.production`** — UAT uses `.env.uat` exclusively.
5. **Always assert `APP_ENV=uat`** in the env file being uploaded.

`lint-safety.sh` enforces (1)–(5) by static inspection.
