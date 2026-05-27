# Phase 0 — Research: UAT / Test Environment

**Feature**: 004-uat-deployment
**Date**: 2026-05-21

Every Technical Context unknown from `plan.md` is resolved here. Each section names the decision, why it was chosen, and what was rejected.

---

## R1 — Environment detection inside the running app

**Decision**: Introduce a single env var `APP_ENV` with three valid values: `production`, `uat`, `development`. The app reads it once at module load via `src/lib/uat/environment.ts` and exposes `isUat(): boolean` and `environmentName(): "production" | "uat" | "development"`.

**Rationale**:
- Single source of truth — used by the banner (FR-021), the allow-list gate (FR-009), the noindex middleware (FR-011), and the magic-link generator (FR-002 — the link is `${process.env.APP_URL}/auth/...`, and `APP_URL` is already environment-scoped per `.env.production`).
- Reusing `NODE_ENV` was rejected: Next.js sets `NODE_ENV=production` for any non-dev build, so it cannot distinguish production-prod from production-UAT. Using `NODE_ENV` here would silently disable the banner on UAT.
- A boolean `UAT_MODE=true` was also rejected: every new boolean reduces clarity. A single tri-state env var is cleaner and lets the system fail loudly if it sees an unknown value.

**Alternatives considered**:
- Detect environment by inspecting `process.env.APP_URL` host part (e.g., presence of `uat-` prefix). Rejected: brittle string-matching, and the spec pins UAT to a raw IP, not a hostname prefix.
- Read environment from a file (e.g., `.env-name`). Rejected: env vars are already the project's configuration convention.

**Validation**: Zod schema in `environment.ts`: `z.enum(["production","uat","development"]).default("development")`. Any other value throws at startup — fail-loud rather than silently default-to-production.

---

## R2 — Allow-list parsing and matching

**Decision**: Parse `UAT_ALLOWED_EMAILS` at module load: split on commas, trim, `toLowerCase()`, deduplicate, reject empty entries. Store as `ReadonlySet<string>`. Lookup is `set.has(email.toLowerCase().trim())`.

**Rationale**:
- The existing magic-link route already normalises the request email to `trim().toLowerCase()` (see `src/app/api/auth/magic-link/route.ts:11-13`). Matching the allow-list against the same canonical form avoids "Mary@x.com vs mary@x.com" false-deny bugs.
- A `Set` gives O(1) membership for every magic-link request without any external store — appropriate at the ≤ 10-tester scale (per plan).
- Read at module load (not per request) so the lookup is hot. Updating the allow-list requires a process restart, matching the clarification.

**Alternatives considered**:
- Wildcards (`@energyone.example`). Rejected: not requested in the spec; the operator can add full addresses, and a wildcard would silently undermine the "only addresses the operator has explicitly added" guarantee in SC-007.
- DB-backed allow-list. Rejected: violates the clarification that there is no admin UI for it.

**Empty / unset handling**: If `APP_ENV=uat` but `UAT_ALLOWED_EMAILS` is unset or empty after parsing, the app refuses to start. Reason: a UAT instance with no allow-list either denies everyone (testers can't log in) or silently allows everyone (data leak). Failing at startup makes the misconfiguration visible immediately.

**Validation**: Zod schema validates each entry against `z.string().email()`. Malformed entries cause a startup error listing every bad address — easier to fix than "silently dropped".

---

## R3 — Enumeration-resistant magic-link gate

**Decision**: When `isUat()` is true, the magic-link route still **performs all the same work it would normally do** (rate-limit check, DB lookup, response shape), but the `sendMagicLink` call is skipped when the request email is not on the allow-list. The HTTP response is identical regardless of allow-list membership. The token row in the DB is still **issued** for allow-listed emails only — non-allow-listed requests do not write to the DB.

**Rationale**:
- FR-010 mandates no enumeration. The existing magic-link route is already enumeration-resistant: it always responds `{ sent: true }` whether or not the account exists (see `magic-link/route.ts:38-58`). The UAT gate must preserve that property.
- Not writing token rows for non-allow-listed emails saves the magic-link rate limiter from being a side-channel oracle (rate-limit-exceeded responses could leak which emails get processed deeply).
- Logging non-allow-listed requests on the server (without ever sending email) gives the operator forensic visibility into which addresses are probing UAT.

**Alternatives considered**:
- Return HTTP 403 for non-allow-listed addresses. Rejected: that's the textbook enumeration leak FR-010 forbids.
- Send the email but to a black-hole address. Rejected: same DB-write side channel; also wastes SMTP quota.

---

## R4 — Visual UAT banner (FR-021)

**Decision**: Add `<UatBanner />` to `src/app/layout.tsx`. It renders a sticky, full-width yellow bar at the top of every page when `isUat()` is true, with the text "UAT environment — non-production data may be present". The banner is a server component (no client JS) and adds ~80 bytes to the rendered HTML.

**Rationale**:
- One mount point (`layout.tsx`) means every page — admin, member, sign-in, invitation acceptance — inherits the banner without per-page work, satisfying SC-005.
- Server-rendered means it shows up even on the first paint before hydration; relevant because UAT testers may navigate quickly and a flash-of-no-banner would weaken the signal.
- Yellow chosen because the existing Tailwind palette in `tailwind.config.ts` already has `bg-yellow-400` / `text-yellow-900` and they are not used by any production UI element.

**Alternatives considered**:
- Replace the favicon. Rejected: too subtle; doesn't satisfy "unmistakable visual indicator" (FR-021).
- Inject the banner via Nginx `sub_filter`. Rejected: more moving parts, harder to test, and would break the streaming response path for some Next.js routes.

---

## R5 — `noindex` directive (FR-011)

**Decision**: A Next.js middleware (`src/middleware.ts`) emits `X-Robots-Tag: noindex, nofollow` on every response when `isUat()` is true. Production passes through unchanged. No `<meta name="robots">` tag is needed because `X-Robots-Tag` applies to every resource (HTML, JSON, images), not just rendered pages.

**Rationale**:
- One middleware ≪ touching every route handler.
- `X-Robots-Tag` is the spec-blessed mechanism (Google, Bing, DuckDuckGo all honour it).
- Production must not get `noindex` — the gate on `isUat()` ensures that.

**Alternatives considered**:
- `public/robots.txt` Disallow. Rejected: only some crawlers honour `robots.txt`; `X-Robots-Tag` is mandatory in the response and more enforceable.

---

## R6 — Reusing `scripts/deploy.sh` for UAT

**Decision**: Add `scripts/uat/deploy.sh` as a **thin wrapper** that sets `EC2_HOST_OVERRIDE`, `KEY_FILE_OVERRIDE`, `ENV_FILE_OVERRIDE`, and `APP_DIR_OVERRIDE` and then sources `scripts/deploy.sh` with a `--target uat` flag. The existing `deploy.sh` is extended to honour those overrides (with sensible production defaults when unset). The same Next.js build artefacts are uploaded.

**Rationale**:
- Re-implements no business logic.
- Guarantees FR-006 (same artefacts deploy to both environments) because the **build phase is identical** — only the upload target changes.
- The override-env-var pattern keeps the diff to `deploy.sh` small and auditable.

**Alternatives considered**:
- A fork `scripts/deploy-uat.sh` of `deploy.sh`. Rejected: doubles maintenance cost; the two scripts will drift.
- A single mega-script with a `--env` flag and `case` statement. Rejected: makes the production code path harder to read; per the project rules ("many small files > few large files").

**Diff to `scripts/deploy.sh`**: ~15 lines, replacing five hardcoded paths/hosts with `${VAR:-default}` lookups.

---

## R7 — Refresh from production

**Decision**: `scripts/uat/refresh-from-prod.sh` runs on the operator's laptop and does the following, in order:

1. Take a UAT db snapshot via `scripts/uat/snapshot.sh` (rotating two-deep retention — FR-019).
2. SSH to production, `sqlite3 prod.db ".backup /tmp/prod-snapshot.db"` (online-safe backup; production stays up).
3. `scp` the snapshot to the operator's laptop, then `scp` to UAT.
4. SSH to UAT and atomically replace `prisma/uat.db` with the new snapshot, then run a small SQL script that:
   - `DELETE FROM magic_link_tokens` (FR-015)
   - `DELETE FROM sessions` (FR-015)
   - Strips Super Admin from the production Super Admin's UserAccount row, leaving the UAT bootstrap account as the only Super Admin (FR-022 — implementation detail: clear `userAccount.isSuperAdmin` for emails ≠ the UAT bootstrap email, then on app restart the bootstrap mechanism in `src/lib/auth/bootstrap.ts` re-grants Super Admin to the configured `BOOTSTRAP_SUPER_ADMIN_EMAIL` value).
5. `pm2 restart fpl-tracker` on UAT.

**Rationale**:
- `sqlite3 .backup` is the only online-safe way to copy an in-use SQLite file (file-level `cp` may capture a partial WAL). It's already available — the EC2 user_data installs `sqlite3` indirectly via Node.js's bundled tools.
- Doing the token/session purge **after** the file copy means the cleanup is part of the same audit-able script — no chance of forgetting it.
- Re-using `src/lib/auth/bootstrap.ts` to re-assert the UAT Super Admin keeps the role bootstrap in **one** place, regardless of environment.

**Alternatives considered**:
- `pg_dump`-style logical export + import. Rejected: SQLite ships a native `.backup` command; logical export adds 30+ seconds for no benefit.
- Stream the snapshot directly UAT-to-prod over SSH. Rejected: harder to debug; an intermediate file on the laptop also doubles as the operator's local audit log.
- Truncate then re-insert by table. Rejected: every Prisma schema change would require updating the truncate script. The full-file replace just works.

**Idempotency (FR-016)**: Each invocation does its own snapshot rotation and overwrites the result atomically. Running twice is equivalent to running once with a slightly newer snapshot.

---

## R8 — Rollback

**Decision**: `scripts/uat/rollback.sh` restores the previous `.next/standalone` directory and the previous `uat.db` snapshot (both kept under `/home/ec2-user/backups/`). PM2 restarts the app pointing at the restored artefacts.

**Rationale**:
- Mirrors how production rollback is expected to work (per spec) so the team builds reusable muscle memory.
- `/home/ec2-user/backups/` is `chmod 700` and stays on the UAT instance — no separate storage product, no IAM changes.
- Two-deep retention satisfies FR-019.

**Alternatives considered**:
- S3-based snapshots. Rejected: out of scope; adds an IAM dependency.
- Git-based rollback (deploy by `git checkout`). Rejected: production currently ships built artefacts via rsync, not source; the rollback path must match.

---

## R9 — Terraform topology for the second instance

**Decision**: Add `aws_instance.uat` and `aws_security_group.uat` parallel to the existing `aws_instance.app` and `aws_security_group.app`, gated behind `var.enable_uat` (default `true`). Reuse the existing `aws_key_pair.deploy` (same SSH key). Output the UAT public IP as `output.uat_public_ip`.

**Rationale**:
- Same Terraform module → no drift; one `terraform apply` (`taint`/`replace` if needed) maintains both.
- Same key pair so the operator does not have to juggle two PEM files.
- `enable_uat` as a variable means an operator who wants to tear UAT down to save costs can `terraform apply -var enable_uat=false` without losing the production instance.

**Alternatives considered**:
- Auto Scaling Group with two instances. Rejected: way more machinery than needed.
- Two separate AWS accounts. Rejected: free-tier billing splits; introduces an IAM hurdle for the operator with no isolation benefit beyond what separate security groups already provide.

**Cost**: A second `t2.micro` is free-tier eligible for the first 750 hours/month per account; in this account, production is already consuming part of that allowance, so adding a second instance may push monthly hours past 750. The spec explicitly accepts this trade-off (Assumptions §Free tier).

---

## R10 — Snapshot retention storage layout

**Decision**: On the UAT host, store rotated snapshots under `/home/ec2-user/backups/uat/`:

```
/home/ec2-user/backups/uat/
├── current/             # symlink target before each refresh, restored on rollback
├── previous/            # one-snapshot history (FR-019)
└── pre-refresh/         # auto-snapshot captured by refresh-from-prod.sh before overwrite
```

Each `*.db` file is `chmod 600` and owned by `ec2-user`.

**Rationale**:
- Two-deep retention satisfies FR-019. A third-deep (oldest) snapshot is intentionally not kept — the spec asks for two, and unbounded retention is a leak risk.
- The `pre-refresh/` slot exists separately from `previous/` so that a refresh followed by a rollback restores **the state immediately before the refresh**, not the state two refreshes ago.

**Rotation logic** (in `snapshot.sh`):
1. If `current/` exists, move it to `previous/` (replacing any existing `previous/`).
2. Take new snapshot into `current/`.

For refresh, the rotation is:
1. Move `current/` → `pre-refresh/` (overwriting any prior `pre-refresh/`).
2. Copy production snapshot into `current/`.

Rollback symmetric: `current/` ← `pre-refresh/` (for refresh-rollback) or `current/` ← `previous/` (for deploy-rollback).

---

## R11 — Production secret hygiene during the build

**Decision**: The UAT `.env.uat` file is **never** assembled from `.env.production`. It is a hand-maintained file owned by the operator. The example file `.env.uat.example` is committed to the repo with empty values; the real `.env.uat` is on the operator's laptop and uploaded to UAT by `scripts/uat/deploy.sh` (exactly the same flow as production, but a different source file).

**Rationale**:
- FR-012 requires a different bootstrap Super Admin between environments. Copying `.env.production` would import the production bootstrap email by accident.
- The existing flagged concern that `.env.production` is git-tracked is **explicitly out of scope** per the spec; this plan does not assume it has been rotated. UAT must therefore not borrow values from it.

**Required UAT env vars** (full list in `contracts/env-vars.md`):
- `APP_ENV=uat`
- `APP_URL=http://<UAT-EIP>/`
- `DATABASE_URL=file:/home/ec2-user/app/prisma/uat.db`
- `UAT_ALLOWED_EMAILS=<comma-separated>`
- `BOOTSTRAP_SUPER_ADMIN_EMAIL=<UAT-specific address>`
- `SESSION_SECRET=<a fresh long random string, different from prod>`
- Everything else (SMTP_*, GROQ_API_KEY) — same as production by the clarification (Q3).

---

## R12 — Robots.txt vs middleware tradeoff

**Decision**: Use middleware-emitted `X-Robots-Tag` (R5). Do **not** modify `public/robots.txt`.

**Rationale**:
- `public/robots.txt` is served identically by both environments because it is a static file in the standalone bundle. Making it environment-conditional would either require splitting the build (FR-006 violation) or generating it at request time (more code than the middleware).
- `X-Robots-Tag` is a strict superset of `robots.txt` for the crawlers we care about. The middleware approach satisfies FR-011 without any production-side risk.

---

## R13 — Health-check / smoke-test for SC-001

**Decision**: A standalone script `scripts/uat/smoke-test.sh` runs after every UAT deploy and checks:

1. `GET http://<UAT-EIP>/sign-in` returns HTTP 200 and contains the UAT banner text.
2. `GET http://<UAT-EIP>/` returns HTTP 200 and contains the UAT banner text.
3. `GET http://<UAT-EIP>/api/auth/magic-link` returns HTTP 405 (Method Not Allowed for GET — a sentinel that the API tier is wired up).
4. `POST` a magic-link request for a non-allow-listed address and assert `{ sent: true }` in the response **and** no row appears in `magic_link_tokens` for that address (SSH + sqlite check).
5. `POST` a magic-link request for an allow-listed address and assert `{ sent: true }` and **exactly one** row appears.

**Rationale**:
- These five checks cover SC-001 (deploy is healthy in < 15 min) and one half of SC-005 (banner visible).
- They are scriptable from the operator's laptop and produce a clear PASS/FAIL.
- Step 4 is the security-critical check — confirms the allow-list gate actually denies, not just appears to.

**Alternatives considered**:
- A full Playwright run on every UAT deploy. Rejected: too slow for SC-001's 15-min budget; Playwright is run quarterly for the rollback rehearsal (SC-004) instead.

---

## R14 — APP_ENV propagation through `next build`

**Decision**: `APP_ENV` is read at **runtime**, not build time. The same standalone build is uploaded to both prod and UAT; each instance has its own `.env.local` (named that way for legacy reasons; on UAT it is populated from `.env.uat`).

**Rationale**:
- Build-time inlining of `APP_ENV` would force two separate builds — direct violation of FR-006.
- Runtime read works because `src/lib/uat/environment.ts` calls `process.env.APP_ENV` only inside exported functions, never at module top-level beyond `const cached = parse(process.env.APP_ENV)`. The cached value is computed at first import, after `process.env` has been populated by the Node runtime from `.env.local`.

**Validation**: Vitest unit test injects `process.env.APP_ENV = "uat"`, imports the module fresh (via `vi.resetModules()`), asserts `isUat() === true`. Symmetric test for `"production"`.

---

## Summary table

| Question | Answer |
|---|---|
| How does the app know which env it's in? | `APP_ENV` env var (R1) |
| Where does the allow-list live? | `UAT_ALLOWED_EMAILS` env var, parsed into a `Set` at startup (R2, R14) |
| How is enumeration prevented? | Same generic response regardless of allow-list membership; no DB write on miss (R3) |
| How does the user see "this is UAT"? | Server-rendered sticky banner in `app/layout.tsx` (R4) |
| How is `noindex` enforced? | Next.js middleware emits `X-Robots-Tag` when `isUat()` (R5) |
| How does deploy happen without forking deploy.sh? | Override-env-var wrapper at `scripts/uat/deploy.sh` (R6) |
| How is data copied from prod? | `sqlite3 .backup` → scp → atomic move + token/session purge (R7) |
| How does rollback work? | Restore previous `.next` + previous `uat.db` from `/home/ec2-user/backups/uat/` (R8) |
| How is UAT provisioned? | Same Terraform module, `aws_instance.uat`, gated by `var.enable_uat` (R9) |
| Where do snapshots live? | `/home/ec2-user/backups/uat/{current,previous,pre-refresh}/` (R10) |
| How do UAT secrets stay separate from prod's? | Hand-maintained `.env.uat`, never copied from `.env.production` (R11) |
| Why middleware over robots.txt? | Robots.txt is part of the shared build; middleware can be environment-conditional (R12) |
| How is "UAT is healthy" verified? | `scripts/uat/smoke-test.sh`, 5 HTTP + DB checks (R13) |

No NEEDS CLARIFICATION items remain.
