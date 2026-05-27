# Contract: UAT environment variables

**Feature**: 004-uat-deployment
**Date**: 2026-05-21

This contract enumerates every environment variable the UAT instance reads, who reads it, when it is read, and what happens on invalid input. It is the source-of-truth for the `.env.uat.example` file checked into the repo.

---

## New variables (UAT-specific)

### `APP_ENV`

| Property | Value |
|---|---|
| **Read by** | `src/lib/uat/environment.ts` — module-level cache |
| **Read when** | First import of any consumer module (`src/middleware.ts`, `app/layout.tsx`, every magic-link / invitation route) |
| **Type** | `"production" \| "uat" \| "development"` |
| **Validator** | `z.enum(["production","uat","development"])` |
| **Default if unset** | `"development"` |
| **Required in UAT** | YES — must be exactly `"uat"`. |
| **Required in prod** | YES — must be exactly `"production"`. |
| **Invalid value behaviour** | Throws at first import. Server fails to start, PM2 reports the crash, deploy is judged unhealthy by `scripts/uat/smoke-test.sh`. |

### `UAT_ALLOWED_EMAILS`

| Property | Value |
|---|---|
| **Read by** | `src/lib/uat/allowlist.ts` — module-level cache |
| **Read when** | First import (which happens only when `isUat() === true`) |
| **Type** | Comma-separated string of email addresses |
| **Validator** | `z.string().trim().toLowerCase().email()` per entry |
| **Default if unset** | None |
| **Required in UAT** | YES — at least one allow-listed email. |
| **Required in prod** | MUST be unset or empty. |
| **Invalid value behaviour** | Throws at first import. Listing one bad entry produces an error naming **every** bad entry, not just the first. |
| **Examples** | `"alice@example.com, bob@example.com"` (whitespace tolerated) |

---

## Existing variables — UAT-specific values

These already exist in production. UAT sets different values; the contract here pins what those values look like.

### `APP_URL`

| Property | Value |
|---|---|
| **Read by** | Magic-link route handlers, email body builders |
| **UAT value** | `http://<UAT-EIP>/` (no trailing path; no port) |
| **Constraint** | MUST NOT equal the production `APP_URL`. The application warns at startup if it does. |
| **Reason for difference** | Magic-link URLs in UAT email must point at UAT, not production (FR-004 trailing requirement). |

### `DATABASE_URL`

| Property | Value |
|---|---|
| **Read by** | Prisma client |
| **UAT value** | `file:/home/ec2-user/app/prisma/uat.db` |
| **Constraint** | MUST NOT point at any path under production's `prisma/` directory (which on prod is `/home/ec2-user/app/prisma/prod.db` on the **production** host — different EC2 instance, so the filesystem is naturally isolated). |
| **Reason** | FR-003 — UAT must never read from or write to the production database. The physical separation by host is the primary defence; the filename difference is a belt-and-braces second line. |

### `BOOTSTRAP_SUPER_ADMIN_EMAIL`

| Property | Value |
|---|---|
| **Read by** | `src/lib/auth/bootstrap.ts` at process start |
| **UAT value** | A UAT-only address (e.g., the operator's `+uat` alias, or a dedicated tester address) |
| **Constraint** | MUST NOT equal the production value (FR-012). The `scripts/uat/deploy.sh` script verifies this before upload and refuses to deploy if they match. |
| **Reason** | A leak of the production Super Admin address must not implicitly compromise UAT, and vice versa. |

### `SESSION_SECRET`

| Property | Value |
|---|---|
| **Read by** | Session cookie signing |
| **UAT value** | A fresh long random string, different from production's. |
| **Constraint** | MUST NOT equal the production `SESSION_SECRET`. |
| **Reason** | Otherwise a cookie issued by UAT would be accepted by production (with the right host) and vice versa. |

---

## Existing variables — UAT-shared values

Per the Q3 clarification, UAT reuses production's outbound email configuration verbatim.

| Variable | UAT value |
|---|---|
| `SMTP_HOST` | Same as production |
| `SMTP_PORT` | Same as production |
| `SMTP_USER` | Same as production |
| `SMTP_PASS` | Same as production |
| `SMTP_FROM` | Same as production |
| `GROQ_API_KEY` | Same as production (low risk; testing AI features needs a real key) |
| `COOKIE_SECURE` | Same as production (i.e., `false` while both are HTTP) |
| `SESSION_TTL_DAYS` | Same as production (or unset → defaults) |
| `SESSION_COOKIE_NAME` | Same as production |

---

## `.env.uat.example` (committed)

The checked-in example file lists every required variable with empty / placeholder values:

```dotenv
# UAT environment — DO NOT use in production
# Copy to .env.uat and fill in. .env.uat is in .gitignore.

APP_ENV=uat
PORT=3000

# Public URL of the UAT instance — must be different from production APP_URL
APP_URL=http://<UAT-ELASTIC-IP>/

# Absolute path on the UAT EC2 instance — must NOT be reachable from production
DATABASE_URL="file:/home/ec2-user/app/prisma/uat.db"

# Allow-list of tester emails — comma-separated; at least one required
UAT_ALLOWED_EMAILS=""

# UAT bootstrap Super Admin — MUST differ from production BOOTSTRAP_SUPER_ADMIN_EMAIL
BOOTSTRAP_SUPER_ADMIN_EMAIL=""

# Fresh random string, MUST differ from production SESSION_SECRET
SESSION_SECRET=""

# Cookies stay non-secure while UAT serves HTTP
COOKIE_SECURE=false

# SMTP — UAT reuses production's outbound email lane by design (see spec §Clarifications Q3)
SMTP_HOST=""
SMTP_PORT=587
SMTP_USER=""
SMTP_PASS=""
SMTP_FROM=""

# Optional LLM key — reuse production's
GROQ_API_KEY=""
```

---

## Startup contract

On first import of `src/lib/uat/environment.ts`, the following sequence runs:

1. Parse `APP_ENV` against the Zod enum. Invalid → throw, process exits.
2. If `APP_ENV === "uat"`: import `src/lib/uat/allowlist.ts`, which parses `UAT_ALLOWED_EMAILS`. Empty / all-invalid → throw.
3. If `APP_ENV === "uat"` **and** `APP_URL` equals a known production URL → log a startup warning. Does not throw — covered by the smoke test instead, because the production URL is itself runtime configuration and `environment.ts` should not encode it as a constant.
4. If `APP_ENV === "production"` **and** `UAT_ALLOWED_EMAILS` is non-empty → throw. (Reason: production must not silently switch to allow-list mode if someone leaks the var into prod's `.env.local`.)

These four checks are unit-tested in `src/lib/uat/__tests__/environment.test.ts`.
