# FFootball Development Guidelines

Auto-generated from all feature plans. Last updated: 2026-05-08

## Active Technologies
- TypeScript 5.x (existing codebase) + Next.js 14 (App Router), TanStack Query v5, Prisma 5 (SQLite), Tailwind CSS, Recharts, nodemailer (already present), Zod (to be added for input validation) (002-multi-league-platform)
- SQLite via Prisma (existing) — schema changes are additive and migrating; SQLite scales to the 50-leagues × 50-members target. No move to Postgres required for v1, but the schema is designed to migrate cleanly later. (002-multi-league-platform)

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
- 002-multi-league-platform: Added TypeScript 5.x (existing codebase) + Next.js 14 (App Router), TanStack Query v5, Prisma 5 (SQLite), Tailwind CSS, Recharts, nodemailer (already present), Zod (to be added for input validation)

- 001-fpl-org-tracker: Added TypeScript 5.x + Next.js 14+ (App Router), TanStack Query v5, Tailwind CSS, Recharts, Prisma (SQLite)

<!-- MANUAL ADDITIONS START -->
<!-- MANUAL ADDITIONS END -->
