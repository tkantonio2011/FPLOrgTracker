# Implementation Plan: UAT / Test Environment

**Branch**: `004-uat-deployment` | **Date**: 2026-05-21 | **Spec**: [`spec.md`](./spec.md)
**Input**: Feature specification from `/specs/004-uat-deployment/spec.md`

## Summary

Stand up a second EC2 instance (matching the production instance class) that runs the same Next.js application against its own SQLite database, gated by an env-var allow-list and visually marked as "UAT" on every page. The same release artefacts that deploy to production deploy to UAT — no UAT-only code paths. A documented "refresh from production" procedure rsyncs the production SQLite file to UAT, then clears the sessions and magic-link tokens so production credentials cannot bypass the UAT allow-list.

Per the clarifications in [`spec.md`](./spec.md):

- UAT runs on a dedicated EC2 instance (Q1 → A).
- UAT may hold a verbatim copy of production data; the allow-list and the separate bootstrap account are the only controls (Q2 → A).
- UAT shares production's SMTP sender (Q3 → A).
- The allow-list is an env var read at app startup (Q4 → A).
- UAT is served at a raw Elastic IP, no DNS, HTTP only (Q5 → A).

This plan stays within those decisions and does **not** introduce TLS, a separate SMTP provider, or sanitisation tooling.

## Technical Context

**Language/Version**: TypeScript 5.5 (existing codebase)
**Primary Dependencies**: Next.js 14 (App Router), Prisma 5, TanStack Query 5, Tailwind 3 — all already installed. **No new runtime dependencies are added by this feature.**
**Storage**: SQLite via Prisma — same `schema.prisma`, separate database file on the UAT host (`/home/ec2-user/app/prisma/uat.db`).
**Testing**: Vitest (unit + integration, already configured); Playwright (E2E, already configured). New tests: a unit test for the allow-list parser and a unit test for `requireUatAccessOrEnumerationStub()`.
**Target Platform**: Amazon Linux 2023 on a `t2.micro` EC2 instance (same instance class as production), Node.js 20 LTS, PM2 process manager, Nginx HTTP front (no TLS). The build host remains Windows (developer laptop).
**Project Type**: Web service — Next.js standalone output behind Nginx. Existing layout in `src/app/(main|auth)/` and `src/app/api/`.
**Performance Goals**: Not load-bearing for UAT. Same hardware as production (a `t2.micro` comfortably serves the existing UI). Deploy procedure must complete in **< 15 min** (SC-001); rollback in **< 15 min** (SC-004).
**Constraints**: Must reuse existing `scripts/deploy.sh` flow — duplicating it would let prod and UAT drift. Must not require schema or model changes (per spec assumption "No new persistent storage product"). Must not introduce a UAT-only code path the production build doesn't exercise (FR-006). Must not break the existing single-tenant legacy models that are still in the schema during the multi-league expand-contract migration.
**Scale/Scope**: ≤ 10 testers on the allow-list, ≤ 1 deploy per release, on-demand snapshot refresh (≤ 1/week typical). One additional EC2 instance, one additional Elastic IP, one additional security group.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

The project's `.specify/memory/constitution.md` is the unfilled template — no project-specific principles are ratified yet. Standing in lieu of project-level principles, this plan is gated against the user's global rules (`~/.claude/rules/common/` and `~/.claude/rules/typescript/`):

| Gate | How this plan complies |
|---|---|
| Immutability (coding-style.md) | All new helpers (allow-list parser, environment detector, snapshot-prep logic) return new values rather than mutating inputs. |
| Many small files > few large (coding-style.md) | New code lives in `src/lib/uat/` (parser + env helpers) and `scripts/uat/` (deploy + refresh + rollback). No single file exceeds 200 LOC. |
| Error handling at every level (coding-style.md) | Allow-list parser surfaces malformed entries as a startup-time fatal error rather than silently allow-listing nobody (which would lock testers out) or everyone (which would expose prod data). |
| Input validation at boundaries (coding-style.md) | All env-var inputs (`UAT_ALLOWED_EMAILS`, `APP_ENV`) are Zod-validated on first read. |
| No hardcoded secrets (security.md) | The UAT bootstrap Super Admin email is read from `BOOTSTRAP_SUPER_ADMIN_EMAIL` per environment. No secrets are checked in. The known leak in `.env.production` is out of scope and tracked separately (see spec Assumptions). |
| 80% test coverage (testing.md) | New code has Vitest unit coverage for parsing, environment detection, and the magic-link allow-list gate. A Playwright smoke test exercises the deployed UAT (separate target so it does not run against production). |
| Git workflow (git-workflow.md) | All changes land on `004-uat-deployment`, conventional-commit prefixes, single PR to `main`. |
| Code review (code-review.md) | Once code lands, the **code-reviewer** and **security-reviewer** agents must run before merge — the allow-list gate is security-sensitive. |

**Verdict**: No violations. No Complexity Tracking entry needed.

## Project Structure

### Documentation (this feature)

```text
specs/004-uat-deployment/
├── plan.md                      # this file
├── spec.md
├── research.md                  # Phase 0 output
├── data-model.md                # Phase 1 output (no DB changes; describes Environment config surface)
├── quickstart.md                # Phase 1 output: operator runbook
├── contracts/
│   ├── env-vars.md              # all UAT-relevant env vars
│   ├── allow-list-format.md     # UAT_ALLOWED_EMAILS parsing rules
│   └── deploy-cli.md            # scripts/uat/*.sh interface
├── checklists/
│   └── requirements.md          # (already exists)
└── tasks.md                     # Phase 2 output (NOT created here — /speckit.tasks emits it)
```

### Source Code (repository root)

```text
src/
├── lib/
│   └── uat/
│       ├── environment.ts        # NEW: reads APP_ENV, exposes isUat() / environmentName()
│       ├── allowlist.ts          # NEW: parses UAT_ALLOWED_EMAILS, exposes isEmailAllowed()
│       └── __tests__/
│           ├── environment.test.ts
│           └── allowlist.test.ts
├── app/
│   ├── api/auth/magic-link/route.ts   # MODIFIED: short-circuit non-allow-listed emails when isUat()
│   ├── api/invitations/route.ts       # MODIFIED: same allow-list gate
│   └── layout.tsx                     # MODIFIED: render <UatBanner /> when isUat()
├── components/
│   └── uat/
│       └── UatBanner.tsx              # NEW: persistent visual indicator (FR-021)
└── ... (existing files unchanged)

scripts/
├── deploy.sh                          # UNCHANGED — production deploy
└── uat/                               # NEW: UAT-only operator scripts
    ├── deploy.sh                      # mirrors deploy.sh but targets UAT host + UAT env file
    ├── refresh-from-prod.sh           # rsync prod.db → uat.db, then sanitise tokens/sessions
    ├── rollback.sh                    # restore .next previous + uat.db snapshot
    └── snapshot.sh                    # take a UAT db snapshot (called automatically pre-refresh)

terraform/
├── ec2.tf                             # MODIFIED: add aws_instance.uat parallel to .app
├── networking.tf                      # MODIFIED: aws_security_group.uat (parallel to .app)
├── outputs.tf                         # MODIFIED: output uat_public_ip
└── variables.tf                       # MODIFIED: var.enable_uat (default true)

.env.uat.example                       # NEW: documented env-var template for UAT
public/
└── robots.txt                         # MODIFIED: served verbatim; the noindex directive
                                       #   for UAT comes from a runtime middleware (see below)

src/middleware.ts                      # NEW or MODIFIED: when isUat(), emit
                                       #   `X-Robots-Tag: noindex, nofollow` on every response.
```

**Structure Decision**: Reuse the existing single Next.js app and the existing Terraform module. UAT is a second EC2 instance configured by the same Terraform code with a flag (`var.enable_uat`); the application detects which environment it is in via `APP_ENV=uat|production` and gates behaviour accordingly. This keeps the production code path identical to UAT's code path (FR-006) — there are no UAT-only files in `src/app/` other than the banner component, which mounts conditionally based on `isUat()`.

The "duplicate `terraform/` directory" alternative was rejected because it doubles drift risk: any IAM, networking, or AMI fix made to production Terraform would need to be re-applied to UAT Terraform by hand.

The "second Next.js app in a monorepo" alternative was rejected on the same drift grounds and because the spec explicitly requires "the same build deploys to either environment" (FR-006).

## Complexity Tracking

> No constitution-check violations to justify. This section is intentionally left empty.
