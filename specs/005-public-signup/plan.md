# Implementation Plan: Public sign-up for League Admins

**Branch**: `005-public-signup` | **Date**: 2026-05-22 | **Spec**: [`spec.md`](./spec.md)
**Input**: Feature specification from `/specs/005-public-signup/spec.md`

## Summary

Add a public `/sign-up` page that lets any visitor self-create a `UserAccount` and become admin of a brand-new `League` of their choosing — without Super Admin intervention. The flow is **deferred-creation, magic-link-verified**: form submission verifies the FPL mini-league ID against the public FPL API, then issues a single-use `MagicLinkToken` of new purpose `"self_signup"` whose payload carries the desired league name and mini-league ID. The `UserAccount`, `League`, `LeagueMembership`, and audit event are written in a single transaction at magic-link click time. Existing users who hit the sign-up form receive a regular sign-in link (no new league). Signed-in users get an in-app "create another league" form that creates the league synchronously (no second magic-link).

Per the clarifications in [`spec.md`](./spec.md):

- Public sign-up accepts **any email on every environment** — no UAT allow-list (Q1).
- All DB writes happen at **magic-link click time**, not at form submission (Q2).
- FPL mini-league ID is verified **at form submission with a ≤3s timeout**; "no such league" rejects inline; FPL-unreachable proceeds with the league flagged unverified (Q3).
- Rate limits **reuse the existing `magic-link.ts` buckets** (5/min/email, 30/hr/email, 20/min/IP) — no new subsystem (Q4).
- The sign-up surface lives at `/sign-up`, discoverable via an **adjacent text link** below the `/sign-in` form (Q5).

This plan stays within those decisions and does **not** introduce passwords, CAPTCHA, a payment surface, or a new role.

## Technical Context

**Language/Version**: TypeScript 5.5 (existing).
**Primary Dependencies**: Next.js 14 (App Router), Prisma 5, Zod, TanStack Query 5, Tailwind 3 — all already installed. **No new runtime dependencies are added.**
**Storage**: SQLite via Prisma. **One additive migration** adds a `selfSignupPayload` nullable column to `MagicLinkToken` and extends the `purpose` enum-by-convention to include `"self_signup"`. No new tables.
**Testing**: Vitest unit + integration (existing); Playwright E2E (existing, opt-in). New tests: slug-allocation, FPL verification helper, the self-signup token issue + consume happy path, the rate-limit-and-enumeration paths, the duplicate-email and duplicate-mini-league-ID paths.
**Target Platform**: Same as 002/004 — Amazon Linux 2023 EC2 instance, Node.js 20, PM2, Nginx. UAT inherits this feature exactly the same way as production.
**Project Type**: Web service — Next.js standalone output behind Nginx.
**Performance Goals**: Sign-up form response **≤ 3.5 s p95** including the FPL verification call (3 s timeout + the rest of the handler). Magic-link click → admin shell **≤ 2 s p95** (one transaction + one redirect).
**Constraints**: (1) No new role — admin grant uses the existing `LeagueMembership.role = "admin"` mechanism. (2) Atomic creation at click time — a partial state (account but no league, or vice versa) is a defect. (3) Reuse all existing rate-limit buckets, validation helpers, audit-event taxonomy, slug-generation helper, FPL client, session creation. (4) The `/sign-in` page itself stays unchanged in shape; the only addition is an adjacent link.
**Scale/Scope**: Sign-up traffic is expected at < 50 submissions / day on production, < 10 / day on UAT. The in-process rate-limit buckets are appropriate for this scale.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

The project's `.specify/memory/constitution.md` is the unfilled template; standing in lieu of project principles, this plan is gated against the user's global rules:

| Gate | How this plan complies |
|---|---|
| Immutability (coding-style.md) | Self-signup token issuance returns a frozen payload object. The route handlers create new DB rows rather than mutating any in-place. |
| Many small files > few large (coding-style.md) | New code lives in `src/lib/signup/` (token + payload helpers), `src/lib/fpl/verify-mini-league.ts`, `src/app/api/auth/signup/route.ts`, `src/app/(auth)/sign-up/page.tsx`, `src/components/auth/SignupForm.tsx`. No single file exceeds 200 LOC. |
| Error handling at every level | Each FPL API failure mode (404, timeout, network, malformed body) is mapped to a discrete result type at the helper boundary. The route handler never lets a Prisma exception bubble up unhandled. |
| Input validation at boundaries | Zod schema for the body; FPL ID is a positive integer; display name is the existing `nameSchema`; the slug is generated server-side, never accepted from the client. |
| No hardcoded secrets | No new secrets. The FPL API is unauthenticated. |
| 80% test coverage | New code has Vitest coverage for the slug allocator (collision + auto-suffix), the FPL verifier (success / 404 / timeout / network), the token issue/consume cycle, the rate-limit branch, the duplicate-email branch, and the duplicate-mini-league-ID branch. |
| Git workflow | All changes land on `005-public-signup`, conventional-commit prefixes, single PR to `main`. |
| Code review | **code-reviewer** and **security-reviewer** agents must run before merge — the new public endpoint is internet-facing and the new token type is security-sensitive. |

**Verdict**: No violations. No Complexity Tracking entry needed.

## Project Structure

### Documentation (this feature)

```text
specs/005-public-signup/
├── plan.md                      # this file
├── spec.md
├── research.md                  # Phase 0 output
├── data-model.md                # Phase 1 output (one additive migration)
├── quickstart.md                # Phase 1 output: operator + tester runbook
├── contracts/
│   ├── signup-endpoint.md       # POST /api/auth/signup
│   ├── self-signup-token.md     # MagicLinkToken.purpose=self_signup payload shape
│   ├── create-another-league.md # POST /api/leagues (signed-in path)
│   └── audit-events.md          # new action codes
├── checklists/
│   └── requirements.md          # already exists
└── tasks.md                     # Phase 2 output (/speckit.tasks emits)
```

### Source Code (repository root)

```text
src/
├── lib/
│   ├── signup/
│   │   ├── token.ts                       # NEW: issueSelfSignupToken / peekSelfSignupToken / consumeSelfSignupToken
│   │   ├── slug.ts                        # NEW: moves slugify + resolveAvailableSlug out of /platform/leagues/route.ts
│   │   │                                  #      so they're shared by signup, /platform, and the in-app form
│   │   ├── payload.ts                     # NEW: Zod schema for the desired-league payload stored on the token
│   │   └── __tests__/
│   │       ├── slug.test.ts
│   │       ├── payload.test.ts
│   │       └── token.test.ts
│   ├── fpl/
│   │   └── verify-mini-league.ts          # NEW: 3 s-timeout verifier; result type union (Verified, NoSuchLeague, Inconclusive)
│   └── auth/
│       └── magic-link.ts                  # MODIFIED: add issueSelfSignupToken / consumeSelfSignupToken alongside
│                                          # existing issueSignInToken / issueInvitationToken.
├── app/
│   ├── (auth)/
│   │   ├── sign-in/page.tsx               # MODIFIED: add adjacent "Don't have a league yet? Create one →" link
│   │   └── sign-up/
│   │       └── page.tsx                   # NEW: server component shell + SignupForm client component
│   ├── api/
│   │   ├── auth/
│   │   │   ├── signup/route.ts            # NEW: POST handler — form submission
│   │   │   └── verify/route.ts            # MODIFIED: handle the new purpose=self_signup branch
│   │   └── leagues/route.ts               # NEW: POST handler — signed-in "create another league"
├── components/
│   └── auth/
│       ├── SignupForm.tsx                 # NEW: client component, three fields + submit + result panel
│       └── CreateAnotherLeagueForm.tsx    # NEW: client component for the signed-in flow
└── ...

prisma/
└── migrations/005_self_signup/
    └── migration.sql                       # adds magic_link_tokens.self_signup_payload JSON column

tests/
├── unit/signup/                            # mirrors src/lib/signup/__tests__
└── integration/signup/                     # full route-handler test
```

**Structure Decision**:

Reuse the existing `MagicLinkToken` model with a new `purpose` value (`"self_signup"`) rather than introducing a new table. Rationale:
- `MagicLinkToken` already has the right shape (token hash, expiry, single-use semantics, IP, garbage-collection by the existing cleanup).
- Adding a `self_signup_payload` nullable JSON column to that table is one additive column and zero new indexes — minimal diff against the schema.
- Reuses the existing `consumeToken` atomic update-with-where-clause for single-use enforcement.
- The existing magic-link verify route at `/api/auth/verify` is the natural landing place; we add one new branch alongside `sign_in` and `invitation`.

The "new dedicated `SelfSignupToken` table" alternative was rejected because it would duplicate 80% of the `MagicLinkToken` schema and require parallel cleanup, parallel rate-limit accounting, and a parallel verify route.

The "create-rows-eagerly with a `verifiedAt` flag" alternative was rejected per the Q2 clarification (atomic creation at click time).

## Complexity Tracking

> No constitution-check violations. Empty.
