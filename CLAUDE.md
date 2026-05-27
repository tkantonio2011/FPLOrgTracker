# FFootball Development Guidelines

Auto-generated from all feature plans. Last updated: 2026-05-22

## Active Technologies
- TypeScript 5.x (existing codebase) + Next.js 14 (App Router), TanStack Query v5, Prisma 5 (SQLite), Tailwind CSS, Recharts, nodemailer (already present), Zod (to be added for input validation) (002-multi-league-platform)
- SQLite via Prisma (existing) — schema changes are additive and migrating; SQLite scales to the 50-leagues × 50-members target. No move to Postgres required for v1, but the schema is designed to migrate cleanly later. (002-multi-league-platform)
- TypeScript 5.x (existing codebase) + Next.js 14 (App Router), TanStack Query v5, Prisma 5 (SQLite), Tailwind CSS, Zod — all already installed. (002-multi-league-platform)
- SQLite via Prisma — **no schema changes**. (002-multi-league-platform)
- None — content is static MDX in the repo. No new Prisma models. (`Topic.lastUpdated` is a frontmatter string, not a DB column.) (003-user-manual)
- TypeScript 5.5 (existing codebase) + Next.js 14 (App Router), Prisma 5, TanStack Query 5, Tailwind 3 — all already installed. **No new runtime dependencies are added by this feature.** (004-uat-deployment)
- SQLite via Prisma — same `schema.prisma`, separate database file on the UAT host (`/home/ec2-user/app/prisma/uat.db`). (004-uat-deployment)
- TypeScript 5.5 (existing). + Next.js 14 (App Router), Prisma 5, Zod, TanStack Query 5, Tailwind 3 — all already installed. **No new runtime dependencies are added.** (005-public-signup)
- SQLite via Prisma. **One additive migration** adds a `selfSignupPayload` nullable column to `MagicLinkToken` and extends the `purpose` enum-by-convention to include `"self_signup"`. No new tables. (005-public-signup)

- TypeScript 5.x + Next.js 14+ (App Router), TanStack Query v5, Tailwind CSS, Recharts, Prisma (SQLite) (001-fpl-org-tracker)

## Project Structure

```text
backend/
frontend/
tests/
```

## Commands

npm test; npm run lint

## Code Style

TypeScript 5.x: Follow standard conventions

## Recent Changes
- 005-public-signup: Added TypeScript 5.5 (existing). + Next.js 14 (App Router), Prisma 5, Zod, TanStack Query 5, Tailwind 3 — all already installed. **No new runtime dependencies are added.**
- 004-uat-deployment: Added TypeScript 5.5 (existing codebase) + Next.js 14 (App Router), Prisma 5, TanStack Query 5, Tailwind 3 — all already installed. **No new runtime dependencies are added by this feature.**
- 003-user-manual: Added TypeScript 5.x (existing codebase)


<!-- MANUAL ADDITIONS START -->
<!-- MANUAL ADDITIONS END -->
