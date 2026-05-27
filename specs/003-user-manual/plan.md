# Implementation Plan: In-App User Manual

**Branch**: `003-user-manual` | **Date**: 2026-05-18 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/003-user-manual/spec.md`

## Summary

Ship an in-app, source-controlled user manual that covers every member-facing surface and every League Admin task, illustrated with annotated screenshots, reachable from a sidebar entry and from a per-page contextual "?" affordance, with client-side search over a build-time index. Content authored as MDX with frontmatter; manifest + search index generated at build time; topics rendered through a single dynamic route. No new DB tables, no new auth pathways, no new API endpoints.

## Technical Context

**Language/Version**: TypeScript 5.x (existing codebase)
**Primary Dependencies (existing)**: Next.js 14 (App Router), Tailwind CSS, TanStack Query v5
**Primary Dependencies (new)**: `@next/mdx`, `@mdx-js/loader`, `@mdx-js/react` (MDX support in App Router), `@tailwindcss/typography` (prose styling for topic bodies), `gray-matter` (frontmatter parsing at build time), `fuse.js` (small, well-maintained fuzzy search; ~5 kB gz client cost, fine for our ~30-topic corpus)
**Storage**: None — content is static MDX in the repo. No new Prisma models. (`Topic.lastUpdated` is a frontmatter string, not a DB column.)
**Testing**: Vitest (existing) for unit/integration; Playwright (existing) for E2E. New unit tests cover the frontmatter loader, the search ranker, and the audience filter. New E2E spec covers: sidebar entry → welcome → topic; contextual help deep-link with return path; search returns correct topic; mobile lightbox.
**Target Platform**: Same as the rest of the app — Next.js 14 standalone build on AWS EC2, served behind Nginx.
**Project Type**: Web application (single Next.js codebase, App Router). No new project added.
**Performance Goals**: Topic page loads in under 2 s on a typical broadband connection (SC-009 by extension). Search results in under 100 ms after keystroke on a 30-topic corpus.
**Constraints**: Manual content ships in the standalone build; no runtime DB access for the manual itself. Screenshots optimised by `next/image` so the page weight stays under ~1 MB per topic on desktop. Manual must inherit the existing `AppShell` chrome so navigation, focus traps, and mobile drawer behaviour are unchanged.
**Scale/Scope**: ~25–30 initial topics (one per feature page + ~8 admin tasks + ~5 getting-started topics). One annotated image per topic on average → ~30 PNGs at maybe 80–200 kB each.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

The project constitution at `.specify/memory/constitution.md` is still the unfilled scaffold (no ratified principles). In its absence the planning constraints are the conventions already in force in this repo:

- **No implementation details in spec**: spec.md remains technology-agnostic; this plan is the first artefact that names libraries. PASS.
- **Static-first, no new persistence layer unless strictly necessary**: this plan adds zero DB tables. PASS.
- **Reuse the existing app shell rather than building a parallel surface**: the manual lives inside `AppShell` and inherits sidebar/nav/auth gating. PASS.
- **Source-controlled content**: MDX in the repo, no CMS. PASS.
- **Accessibility baseline matches the rest of the app**: keyboard nav, alt text, semantic headings, focus management. PASS.
- **No new auth pathways**: the manual is gated by the same middleware that already protects `(main)/...` routes. PASS.

When the constitution is filled in, this section will be re-evaluated. The post-design re-check at the end of Phase 1 confirms nothing new violates the points above.

## Project Structure

### Documentation (this feature)

```text
specs/003-user-manual/
├── plan.md                    # This file
├── research.md                # Phase 0 output — Section/Topic data + library choices
├── data-model.md              # Phase 1 output — Topic / Section / Visual / SearchIndex shapes
├── quickstart.md              # Phase 1 output — How to add a topic, refresh a screenshot
├── contracts/
│   ├── topic-frontmatter.md   # The shape of `---` frontmatter authors must produce
│   ├── help-button.md         # `<HelpButton topic="...">` component contract
│   └── routes.md              # URL contract for `/help` and `/help/<section>/<topic>`
└── checklists/
    └── requirements.md        # Already created by /speckit.specify
```

### Source Code (repository root)

```text
src/
├── app/
│   └── (main)/
│       └── help/
│           ├── layout.tsx              # Manual chrome: TOC sidebar, search field, breadcrumb
│           ├── page.tsx                # Welcome + section grid
│           └── [...slug]/
│               └── page.tsx            # Resolves slug → MDX → renders <TopicView>
│
├── components/
│   ├── layout/Sidebar.tsx              # ← modified: adds the "Help" entry (platform-scoped)
│   └── manual/
│       ├── ManualLayout.tsx            # TOC + search column (used by `help/layout.tsx`)
│       ├── ManualTOC.tsx               # Renders the manifest as a grouped, role-tagged tree
│       ├── ManualSearch.tsx            # Debounced search input → fuse.js → results list
│       ├── ManualSearchResults.tsx     # Result list + no-results fallback
│       ├── TopicView.tsx               # Renders an MDX topic with last-updated + audience badge
│       ├── HelpButton.tsx              # The contextual "?" affordance (FR-003)
│       ├── AnnotatedImage.tsx          # Wraps next/image with caption + lightbox-on-click
│       ├── Callout.tsx                 # MDX-exposed "Note / Tip / Warning" block component
│       └── Lightbox.tsx                # Mobile-friendly image enlarger
│
├── content/
│   └── manual/
│       ├── manifest.ts                 # Generated at build time — ordered Section[] → Topic[]
│       ├── 00-getting-started/
│       │   ├── 01-welcome.mdx
│       │   ├── 02-magic-link.mdx
│       │   ├── 03-switching-leagues.mdx
│       │   ├── 04-accepting-an-invitation.mdx
│       │   └── 05-troubleshooting-sign-in.mdx
│       ├── 10-reading-the-app/
│       │   ├── 01-standings.mdx
│       │   ├── 02-live-points.mdx
│       │   ├── 03-transfers.mdx
│       │   ├── 04-form-table.mdx
│       │   ├── 05-season-stats.mdx
│       │   ├── 06-bench-waste.mdx
│       │   ├── 07-captain-history.mdx
│       │   ├── 08-h2h.mdx
│       │   ├── 09-regret.mdx
│       │   ├── 10-agony.mdx
│       │   ├── 11-luck.mdx
│       │   ├── 12-captain-whatif.mdx
│       │   ├── 13-wall-of-shame.mdx
│       │   ├── 14-fixtures.mdx
│       │   ├── 15-ownership.mdx
│       │   ├── 16-differentials.mdx
│       │   └── 17-injuries.mdx
│       └── 20-league-admin/
│           ├── 01-overview.mdx
│           ├── 02-league-settings.mdx
│           ├── 03-syncing-members.mdx
│           ├── 04-inviting-members.mdx
│           ├── 05-editing-members.mdx
│           ├── 06-weekly-digest.mdx
│           ├── 07-audit-log.mdx
│           └── 08-suspended-league.mdx
│
├── lib/
│   └── manual/
│       ├── load-topics.ts              # Reads MDX files + frontmatter at build time
│       ├── search-index.ts             # Builds the Fuse.js index from manifest at build
│       ├── search.ts                   # Client-side Fuse wrapper (typed)
│       ├── audience.ts                 # Role-aware ordering / labelling helpers
│       └── return-path.ts              # Safe-decode `?return=` query param (defends against open-redirect)
│
└── instrumentation.ts                  # ← unchanged
public/
└── manual/
    └── img/
        ├── standings/
        │   ├── overview.png
        │   └── overview.png.alt        # Sidecar text file: alt text source-of-truth
        ├── live-points/
        ├── admin/
        │   ├── invite-member-step-1.png
        │   └── ...
        └── ...

tests/
├── unit/
│   └── manual/
│       ├── load-topics.test.ts         # Frontmatter parsing + manifest ordering
│       ├── search.test.ts              # Ranker — exact match > prefix > substring > fuzzy
│       ├── audience.test.ts            # Role-aware labels / sorting
│       └── return-path.test.ts         # Open-redirect defence
└── e2e/
    └── manual.spec.ts                  # Sidebar → welcome → topic; contextual help; search; mobile lightbox

scripts/
└── build-manual-index.ts               # Optional: stand-alone CLI to rebuild manifest + search index outside next build
```

**Structure Decision**: Single Next.js codebase, no new project. Manual content lives under `src/content/manual/` as MDX files organised by section directory; manifest and search index are derived from those files at build time (`src/content/manual/manifest.ts` is generated, not hand-edited). All UI lives under `src/components/manual/`. The dynamic route at `src/app/(main)/help/[...slug]/page.tsx` resolves any topic by slug. Screenshot assets sit under `public/manual/img/<topic>/<name>.png` with a sidecar `.alt` file for the alt text so prose and visual stay in sync without coupling the MDX to the binary.

## Complexity Tracking

> No constitution violations to justify (constitution is the unfilled scaffold). Recording the two non-trivial structural choices here for transparency:

| Choice | Why | Simpler alternative rejected because |
|---|---|---|
| MDX instead of plain TSX pages or plain Markdown | Authors need callouts, image grids, step-by-step blocks; embedded React components are how those stay consistent across topics | Plain Markdown can't render `<Callout>` or `<AnnotatedImage>` cleanly. Plain TSX makes content harder to edit and review — every change becomes a code change, blurring the "documentation as content" boundary. |
| Build-time manifest + Fuse.js search index | Topics must be discoverable in <100 ms; a server endpoint per keystroke is unwarranted for ~30 static topics | A server-side search route would add an API + a TanStack Query call per keystroke for content that doesn't change between deploys. Build-time index ships once, runs entirely client-side, costs ~5 kB gzipped. |

Both choices are reversible — if the corpus grows past ~150 topics or content becomes editorial (CMS-driven), the build-time index gives way to a search endpoint with the same client interface.

---

The remainder of the plan is the Phase 0 / Phase 1 outputs in their dedicated files:

- Phase 0 / research → [`research.md`](research.md)
- Phase 1 / data model → [`data-model.md`](data-model.md)
- Phase 1 / contracts → [`contracts/`](contracts/)
- Phase 1 / quickstart → [`quickstart.md`](quickstart.md)

## Post-Design Constitution Re-Check

Re-running the gates after Phase 1 design:

- **No DB / persistence growth**: confirmed. Zero new Prisma models. PASS.
- **No new auth pathways**: confirmed. Manual sits under `(main)/...` and inherits the existing middleware. PASS.
- **App shell reuse**: confirmed. `help/layout.tsx` nests inside the existing `(main)/layout.tsx` so sidebar, nav, drawer, and theme are unchanged. PASS.
- **Source-controlled content**: confirmed. MDX + frontmatter in the repo; no external CMS. PASS.
- **Accessibility baseline**: confirmed by the Phase 1 contracts (`HelpButton` and `AnnotatedImage` both require alt text / aria-label; keyboard nav for TOC and search is part of the component contract). PASS.
- **No implementation leakage into spec**: confirmed. spec.md still names no library. PASS.

No new violations introduced by Phase 1.
