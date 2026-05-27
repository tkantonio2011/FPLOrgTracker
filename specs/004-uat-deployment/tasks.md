---

description: "Task list for 004-uat-deployment"
---

# Tasks: UAT / Test Environment

**Input**: Design documents from `/specs/004-uat-deployment/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Included where unit/contract tests are explicitly called out in the contracts (allow-list parser; environment detector; smoke-test script). No end-to-end Playwright tests for this feature beyond what `scripts/uat/smoke-test.sh` performs — full Playwright runs are reserved for the quarterly rollback rehearsal (SC-004).

**Organization**: Tasks are grouped by user story so each can be implemented and shipped independently. **MVP = Phases 1 + 2 + 3 (US1).**

## Format: `[ID] [P?] [Story] Description`

- **[P]**: parallelisable with other [P] tasks in the same phase
- **[Story]**: US1 / US2 / US3 / US4 (matches spec.md user stories)

## Path Conventions

This is a Next.js 14 web service (existing). New code lives under:
- `src/lib/uat/` — environment + allow-list helpers
- `src/components/uat/` — banner
- `src/middleware.ts` — noindex header
- `src/app/api/auth/magic-link/route.ts` (modified) — allow-list gate
- `src/app/api/invitations/route.ts` (modified) — allow-list gate
- `src/app/layout.tsx` (modified) — banner mount
- `scripts/uat/` — operator shell scripts
- `terraform/` — second EC2 instance, security group, output
- `tests/unit/uat/` — Vitest unit tests
- `.env.uat.example` — committed template

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project-level scaffolding shared by all user stories.

- [x] T001 Create `src/lib/uat/` and `src/components/uat/` directories (empty placeholders — files added by later tasks)
- [x] T002 Create `scripts/uat/` directory with a `README.md` linking to `specs/004-uat-deployment/contracts/deploy-cli.md`
- [x] T003 Create `tests/unit/uat/` directory for Vitest unit tests
- [x] T004 [P] Add `.env.uat` and `.env.uat.local` to `.gitignore` (after the existing `.env*` rules if a specific pattern is needed — verify it is already covered by the wildcard before adding a new line)
- [x] T005 [P] Write `.env.uat.example` at repo root per `specs/004-uat-deployment/contracts/env-vars.md` (every required key, empty / placeholder values, comment headers)

**Checkpoint**: Directories and template files exist. No application code changed yet.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core helpers and infrastructure that every user story depends on. **No US-labelled task can begin until Phase 2 is complete.**

- [x] T006 Implement `src/lib/uat/environment.ts` — module-level Zod parse of `APP_ENV` against `z.enum(["production","uat","development"])` defaulting to `"development"`. Export `isUat(): boolean`, `environmentName()`, and a `getEnvironmentConfig()` returning a frozen object. Throw on invalid value. Also: if `APP_ENV === "production"` and `process.env.UAT_ALLOWED_EMAILS` is non-empty, throw at startup (env-vars.md startup contract step 4).
- [x] T007 Implement `src/lib/uat/allowlist.ts` — module-level parse of `UAT_ALLOWED_EMAILS` per `contracts/allow-list-format.md`. Aggregate every malformed entry into one error before throwing. Export `isEmailAllowed(email: string): boolean`. Refuse to be imported unless `isUat() === true` (programming-error guard).
- [x] T008 [P] Write Vitest unit tests at `tests/unit/uat/environment.test.ts` covering: valid `production` / `uat` / `development` / default-unset; invalid value throws; `APP_ENV=production` + non-empty `UAT_ALLOWED_EMAILS` throws. Use `vi.resetModules()` between cases.
- [x] T009 [P] Write Vitest unit tests at `tests/unit/uat/allowlist.test.ts` covering every invariant in `contracts/allow-list-format.md` (clean list, whitespace tolerance, case-insensitive match, trailing comma rejected, internal-whitespace rejected, deduplication, no wildcards, set is frozen, aggregated error message names every bad entry).
- [x] T010 Run `npm test -- tests/unit/uat` and confirm T008 + T009 pass. (Required before any consumer of these helpers is implemented — they are the security boundary.)

**Checkpoint**: `isUat()` and `isEmailAllowed()` are available, unit-tested, and refuse to start on misconfiguration. User-story implementation can begin.

---

## Phase 3: User Story 1 — Validate a release candidate before it touches production (Priority: P1) 🎯 MVP

**Goal**: A second EC2 instance runs the same Next.js build behind a UAT banner, with `noindex` headers, allow-list-gated magic-link sign-in, and a one-command deploy + smoke-test loop. Production is untouched.

**Independent Test**: From a clean working tree, `bash scripts/uat/deploy.sh` exits 0 within 15 minutes; `curl -I http://<UAT-EIP>/` shows `X-Robots-Tag: noindex, nofollow`; the sign-in page contains the "UAT environment" banner; a magic-link request for an allow-listed email writes exactly one token row in `uat.db`; the same request for a non-allow-listed email returns the same response shape but writes zero rows.

### Infrastructure (Terraform)

- [x] T011 [P] [US1] Add `aws_instance.uat` to `terraform/ec2.tf` mirroring `aws_instance.app` (same AMI data source, same instance type, same key pair, same user_data). Gate the resource behind `count = var.enable_uat ? 1 : 0`.
- [x] T012 [P] [US1] Add `aws_security_group.uat` to `terraform/networking.tf` mirroring `aws_security_group.app` (port 22 from `var.ssh_allowed_cidr`, port 80 from `0.0.0.0/0`).
- [x] T013 [US1] Wire the new instance into the existing networking — assign `aws_security_group.uat` to `aws_instance.uat.vpc_security_group_ids`; reuse `data.aws_subnets.default`. Depends on T011, T012.
- [x] T014 [P] [US1] Add `variable "enable_uat"` (bool, default `true`) to `terraform/variables.tf`.
- [x] T015 [US1] Add `output "uat_public_ip"` to `terraform/outputs.tf` reading `aws_instance.uat[0].public_ip` (conditional on `var.enable_uat`). Depends on T011.

### Application code

- [x] T016 [P] [US1] Create `src/components/uat/UatBanner.tsx` — server component, returns a sticky full-width yellow bar with the text "UAT environment — non-production data may be present". Uses `bg-yellow-400 text-yellow-900` Tailwind classes per research R4. Exports a default component.
- [x] T017 [US1] Modify `src/app/layout.tsx` to import `isUat` from `@/lib/uat/environment` and conditionally render `<UatBanner />` at the top of `<body>`. Keep the change behind the `isUat()` guard so production is byte-identical to today's render. Depends on T016.
- [x] T018 [US1] Create `src/middleware.ts` (or modify if it already exists for other reasons) that, when `isUat()` is true, calls `NextResponse.next()` and sets `X-Robots-Tag: noindex, nofollow` on the response. Production passes through unchanged. Add a `config.matcher` that includes every path (`'/((?!_next/static|favicon.ico).*)'`).
- [x] T019 [US1] Modify `src/app/api/auth/magic-link/route.ts`: after the existing rate-limit check, when `isUat() === true`, check `isEmailAllowed(body.email)`. If false, skip both the `issueSignInToken` call and the `sendMagicLink` call; still return `ok({ sent: true })` so the response shape is identical (FR-010). Add a single `console.warn` server-side log with the rejected email for forensic visibility (per research R3). Do not alter any other behaviour.
- [x] T020 [US1] Modify `src/app/api/invitations/route.ts`: apply the same allow-list gate as T019 — when `isUat() === true` and the recipient is not allow-listed, return success but neither create the invitation row nor send email. (Verify this against the existing route's structure before applying; if invitation creation is initiated by an authenticated League Admin rather than the recipient, the gate may apply to the *recipient* address only.)
- [x] T021 [US1] Update `next.config.mjs` if needed to ensure `instrumentationHook` continues to load `src/instrumentation.ts` and that any new `src/middleware.ts` is picked up. (Most likely no change needed — verify.)

### Operator scripts

- [x] T022 [P] [US1] Modify `scripts/deploy.sh` to honour optional override env vars `UAT_EC2_HOST_OVERRIDE`, `UAT_APP_DIR_OVERRIDE`, `UAT_ENV_FILE_OVERRIDE`, `UAT_DB_PATH_OVERRIDE`, and a flag `--target=uat|production` (default `production`). Production code path must be unchanged when no flag is passed. Replace the five hardcoded references identified in research R6 with `${VAR:-default}` lookups. Skip the version bump + CHANGELOG stamp when target is uat.
- [x] T023 [US1] Create `scripts/uat/deploy.sh` per `contracts/deploy-cli.md`. Thin wrapper that: (1) runs the six pre-flight checks (must include `BOOTSTRAP_SUPER_ADMIN_EMAIL` and `SESSION_SECRET` differ from `.env.production` if that file exists locally), (2) exports the override env vars, (3) sources / invokes `scripts/deploy.sh --target=uat`. Depends on T022.
- [x] T024 [P] [US1] Create `scripts/uat/smoke-test.sh` per `contracts/deploy-cli.md` — the seven HTTP/DB checks listed in research R13 with PASS/FAIL output and exit code 0 / 4.
- [x] T025 [US1] Wire `scripts/uat/deploy.sh` to invoke `scripts/uat/smoke-test.sh` at the end and propagate exit codes (deploy exit 4 if smoke fails). Depends on T023, T024.

### Documentation

- [x] T026 [P] [US1] Cross-link `specs/004-uat-deployment/quickstart.md` from `README.md` (under a new "## UAT" section) so a new operator can find the runbook.

**Checkpoint**: US1 done — operator can `terraform apply` to provision UAT, then `bash scripts/uat/deploy.sh` to deploy and verify. Banner, noindex, allow-list, and enumeration-resistance all working. Production untouched.

---

## Phase 4: User Story 2 — Refresh UAT from production (Priority: P2)

**Goal**: Operator can copy production's database into UAT on demand, clearing sessions / tokens / non-bootstrap Super-Admin grants in the process. Production is read-only during the operation.

**Independent Test**: `bash scripts/uat/refresh-from-prod.sh` (operator confirms with `REFRESH`) exits 0 within 15 minutes; afterwards, `sqlite3 uat.db "SELECT COUNT(*) FROM sessions"` returns 0; same for `magic_link_tokens`; and `SELECT email FROM user_accounts WHERE is_super_admin=1` returns exactly the UAT bootstrap email. Production audit-events table shows zero new rows attributable to the refresh.

### Implementation

- [x] T027 [P] [US2] Create `scripts/uat/snapshot.sh` per `contracts/deploy-cli.md` — takes either a `previous/` rotation (default) or `--pre-refresh` rotation. SSHes to UAT, runs `sqlite3 .backup` against `uat.db`, moves files between `/home/ec2-user/backups/uat/{current,previous,pre-refresh}/` slots.
- [x] T028 [US2] Create `scripts/uat/refresh-from-prod.sh` per `contracts/deploy-cli.md` and research R7. Sequence: REFRESH confirmation prompt → call `snapshot.sh --pre-refresh` → SSH prod and `sqlite3 .backup` → `scp` snapshot through operator laptop to UAT → atomic move into place → run cleanup SQL (delete tokens + sessions + clear non-bootstrap super-admin flags) → `pm2 restart` → print row-count summary. Depends on T027.
- [x] T029 [US2] Cleanup SQL: write `scripts/uat/cleanup.sql` containing the three statements (`DELETE FROM magic_link_tokens; DELETE FROM sessions; UPDATE user_accounts SET is_super_admin = 0 WHERE email != ?;`). The bootstrap email is passed in via `sqlite3 -cmd ".param set @bootstrap '..."` or by substitution in the calling script.
- [x] T030 [US2] Verify the existing `src/lib/auth/bootstrap.ts` re-grants Super Admin to `BOOTSTRAP_SUPER_ADMIN_EMAIL` on every cold boot. Read it; if it does, no change required — note in a comment in `refresh-from-prod.sh` that the PM2 restart relies on this. If it does *not* re-grant on every boot, file a separate task (do not modify bootstrap behaviour as part of this feature without re-scoping).
- [x] T031 [P] [US2] Add a `Phase 4` section to `specs/004-uat-deployment/quickstart.md` cross-reference inside `scripts/uat/refresh-from-prod.sh` (a comment at the top pointing at quickstart §"On demand: refresh UAT with production data").

**Checkpoint**: US2 done — operator can refresh UAT with production data; the refresh is idempotent, leaves no copied sessions/tokens behind, and production is touched only for a read-only `.backup`.

---

## Phase 5: User Story 3 — Restrict UAT access to internal testers only (Priority: P1, raised from P2 per Clarifications)

**Goal**: Only allow-listed addresses can sign in; non-allow-listed addresses see the same response (no enumeration); crawlers receive `noindex`.

**Note on status**: The functional controls behind US3 (allow-list gate + middleware + bootstrap separation) are **already shipped by Phase 3** (T018, T019, T020). What remains for US3 are the assurance tasks — proving the controls behave correctly under real probe traffic, documenting allow-list maintenance, and adding the assurance-only tests that exercise the negative paths end-to-end.

**Independent Test**: A non-allow-listed email receives `{"sent":true}` from `/api/auth/magic-link` (matching the allow-listed response) but no DB row, no email; an allow-listed email receives the same response shape with a DB row and an email; `curl -I` on any UAT URL returns `X-Robots-Tag`; the allow-list can be revoked by editing `UAT_ALLOWED_EMAILS` and re-running `bash scripts/uat/deploy.sh --skip-build`.

### Assurance / negative-path tests

- [x] T032 [P] [US3] Add an integration test at `tests/unit/uat/magic-link-gate.test.ts` (despite the path, this is integration in nature — it loads the route handler module directly). Set `APP_ENV=uat` and `UAT_ALLOWED_EMAILS="allowed@x.com"`; mock `db.userAccount.findUnique` and `db.magicLinkToken.deleteMany/create`; POST a request for `allowed@x.com` and assert one token-create call; POST a request for `rejected@y.com` and assert **zero** token-create calls but the same response shape; assert `sendMagicLink` is called only in the first case.
- [x] T033 [P] [US3] Add a similar test at `tests/unit/uat/invitation-gate.test.ts` for the invitation route gate added in T020 (only if invitation flow gating applies — see T020 note).
- [x] T034 [US3] Run `npm test -- tests/unit/uat` and confirm T032 (+ T033 if applicable) pass.

### Allow-list operations

- [x] T035 [P] [US3] Document the allow-list maintenance procedure in `quickstart.md` § "Add or remove a tester" — confirm the existing text matches the env-var approach and the `--skip-build` redeploy path (already present; verify and adjust wording if needed).
- [x] T036 [P] [US3] Add a top-of-file comment to `src/app/api/auth/magic-link/route.ts` explaining the UAT allow-list gate, why it must keep the response shape identical for allow-listed and non-allow-listed addresses, and pointing at `specs/004-uat-deployment/contracts/allow-list-format.md` for the rules. (No behaviour change.)

**Checkpoint**: US3 done — allow-list gate is implemented, tested both positive and negative, and documented for the operator.

---

## Phase 6: User Story 4 — Roll back UAT without affecting production (Priority: P3)

**Goal**: Operator can revert UAT to the previous build, the previous database, or the pre-refresh database independently and quickly.

**Independent Test**: After a deliberately broken UAT deploy, `bash scripts/uat/rollback.sh` completes in < 15 minutes; smoke test passes after rollback; production EC2 instance shows zero new SSH connections or process restarts during the rollback.

### Implementation

- [x] T037 [US4] Create `scripts/uat/rollback.sh` per `contracts/deploy-cli.md` — accept the four flags (`--code`, `--data`, `--refresh`, none = both), pre-flight check that the requested slot exists, restore the slot(s), `pm2 restart`, invoke `scripts/uat/smoke-test.sh`. Depends on T024 (smoke test) and T027 (snapshot layout).
- [x] T038 [US4] Modify `scripts/uat/deploy.sh` to capture a `.next/standalone.previous` slot before each deploy (mirror the existing approach used by `scripts/deploy.sh` if present; otherwise mv `app/.next/standalone` → `app/.next/standalone.previous` then deploy). Depends on T023.
- [x] T039 [US4] Ensure `scripts/uat/snapshot.sh` is invoked automatically by `scripts/uat/deploy.sh` (default rotation: `current` → `previous`) before the new artefacts overwrite anything on UAT. Depends on T023, T027.

### Validation

- [ ] T040 [US4] **DEFERRED to operator runtime** — Run the rollback rehearsal documented in quickstart.md once UAT is provisioned (`terraform apply -var enable_uat=true`). Deliberately break a UAT deploy, run `scripts/uat/rollback.sh`, confirm smoke test passes and production is unaffected. Capture the run time to verify SC-004 (< 15 min).

**Checkpoint**: US4 done — every rollback shape works, production is provably untouched during a rollback, and the procedure has been rehearsed once.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Wire everything together, lock in the cross-feature checks, and refresh the documentation.

- [x] T041 [P] Add a "UAT" entry to `CHANGELOG.md` under the next vNEXT block summarising what 004 ships (banner, allow-list, refresh, rollback, second EC2 instance).
- [x] T042 [P] Add a `## UAT` section to `README.md` that points at `specs/004-uat-deployment/quickstart.md` and the two key contract docs.
- [x] T043 Run the **code-reviewer** agent against all new/modified files in `src/lib/uat/`, `src/middleware.ts`, `src/components/uat/UatBanner.tsx`, `src/app/layout.tsx`, `src/app/api/auth/magic-link/route.ts`, and `src/app/api/invitations/route.ts`. Address CRITICAL / HIGH findings.
- [x] T044 Run the **security-reviewer** agent specifically against the magic-link allow-list gate (T019, T020) — confirm enumeration-resistance is preserved end-to-end, including identical timing characteristics (e.g., both paths still perform the DB lookup before short-circuiting).
- [x] T045 [P] Add a CI / pre-merge grep guard at `scripts/uat/lint-safety.sh` that fails if any file under `scripts/uat/` references `prod.db` write-mode operations (`UPDATE`, `INSERT`, `DELETE` against prod), or `aws_instance.app`. This codifies the production-safety contract from `contracts/deploy-cli.md`.
- [ ] T046 **DEFERRED to operator runtime** — Execute the 13-row acceptance test table in `specs/004-uat-deployment/quickstart.md` § "Acceptance test — verifying the operator workflow" once UAT is provisioned. Tick each row green or file a defect.
- [x] T047 Project memory updated only where a non-obvious lesson surfaced. (Result: none. The implementation followed the plan without discovering hidden constraints worth saving as memory. Skipped per task definition.)

---

## Dependencies & Execution Order

### Phase dependencies

- **Phase 1 (Setup)**: no prerequisites — start immediately.
- **Phase 2 (Foundational)**: depends on Phase 1. **Blocks every US-labelled phase.**
- **Phase 3 (US1)**: depends on Phase 2.
- **Phase 4 (US2)**: depends on Phase 2 **and** Phase 3 (T023 — `scripts/uat/deploy.sh` exists and works — is needed before refresh-from-prod.sh, since refresh-from-prod uses the same SSH key plumbing).
- **Phase 5 (US3)**: depends on Phase 2 + Phase 3 (the controls under test in US3 are implemented in T018/T019/T020).
- **Phase 6 (US4)**: depends on Phase 2 + Phase 3 (rollback restores artefacts laid down by deploy) and Phase 4 (the `pre-refresh` slot is created by Phase 4 work).
- **Phase 7 (Polish)**: after all desired stories are complete.

### Cross-story dependencies inside the diagram

- US1 → US2 (T028 calls into the SSH layer established by T022/T023)
- US1 → US3 (T032 exercises the gate added in T019)
- US1 + US2 → US4 (T037 restores the slots created by T038 / T039 / T028)

### Parallel opportunities

Inside each phase, `[P]` tasks touch different files and can be done concurrently:

- Phase 1: T004 + T005 in parallel.
- Phase 2: T008 + T009 in parallel after T006 and T007 land.
- Phase 3: T011 + T012 + T014 (Terraform) in parallel; T016 + T022 + T024 + T026 in parallel after Terraform is in.
- Phase 4: T027 + T031 in parallel.
- Phase 5: T032 + T033 + T035 + T036 in parallel.
- Phase 6: T037, T038, T039 are sequential (T037 depends on the snapshot layout; T038 prepares the `.next/standalone.previous` slot consumed by T037).
- Phase 7: T041 + T042 + T045 in parallel; T043 and T044 may run as parallel agents.

---

## Parallel Example: Phase 3 (User Story 1)

```bash
# Once Phase 2 is green, kick off these in parallel:
Task: "Add aws_instance.uat to terraform/ec2.tf (T011)"
Task: "Add aws_security_group.uat to terraform/networking.tf (T012)"
Task: "Add variable enable_uat to terraform/variables.tf (T014)"

# Once Terraform settles, in parallel:
Task: "Create src/components/uat/UatBanner.tsx (T016)"
Task: "Modify scripts/deploy.sh for target overrides (T022)"
Task: "Create scripts/uat/smoke-test.sh (T024)"
Task: "Cross-link quickstart.md from README.md (T026)"
```

---

## Implementation Strategy

### MVP first (Phases 1 + 2 + 3)

1. Phase 1 (Setup) — directories, .gitignore, .env.uat.example.
2. Phase 2 (Foundational) — environment helper, allow-list helper, unit tests green.
3. Phase 3 (US1) — Terraform, banner, middleware, gate, deploy script, smoke test.
4. **Validate**: run quickstart §"Once: stand UAT up" + first acceptance-table rows.
5. Ship MVP.

At this point: production is safer for every release (you can validate in UAT first), no production data is at risk (UAT db is empty), and the rest of the work is additive.

### Incremental delivery

- After MVP: add US2 (refresh) when you need realistic data for testing. Until then, hand-crafted test leagues in UAT are sufficient.
- Add US3 assurance tests (Phase 5) whenever you tighten the allow-list audit — they are quick and low-risk.
- Add US4 (rollback) before the first risky UAT deploy. The slot rotation (T038, T039) should land with US1 anyway; only the `rollback.sh` orchestration (T037) and the rehearsal (T040) are deferred.

### Parallel team strategy

- Dev A: Terraform (T011–T015) and operator scripts (T022–T025).
- Dev B: app code (T016–T021) and unit tests (T008, T009, T032).
- Dev C: docs (T005, T026, T035, T041, T042) and acceptance test execution (T046).

---

## Notes

- Each task names exact files. If a path doesn't exist yet, the task creates it.
- The allow-list gate (T019) is the security-critical task — review with **security-reviewer** before merging.
- Phase 7 (T046) is the gate — feature is not "done" until the 13-row table in quickstart.md is all green.
- The well-known concern that `.env.production` is git-tracked is **out of scope** for this feature. Do not bundle that fix into 004 — file it separately.

## Task count summary

| Phase | Tasks | Notes |
|---|---|---|
| 1 Setup | 5 (T001–T005) | 2 parallelisable |
| 2 Foundational | 5 (T006–T010) | 2 parallelisable; T010 is a verification step |
| 3 US1 (MVP) | 16 (T011–T026) | 8 parallelisable across Terraform / app / scripts / docs |
| 4 US2 | 5 (T027–T031) | 2 parallelisable |
| 5 US3 | 5 (T032–T036) | 4 parallelisable |
| 6 US4 | 4 (T037–T040) | Sequential |
| 7 Polish | 7 (T041–T047) | 4 parallelisable; agent reviews can run as background tasks |
| **Total** | **47** | **22 parallelisable** |
