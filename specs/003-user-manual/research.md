# Research: In-App User Manual

**Phase**: 0 — Outline & Research
**Feature**: 003-user-manual
**Date**: 2026-05-18

This document resolves the open technical questions implied by spec.md and the plan's Technical Context. Each decision is structured as **Decision → Rationale → Alternatives considered**.

---

## R1. Content authoring format — MDX vs. Markdown vs. TSX

**Decision**: MDX with frontmatter, processed via `@next/mdx` + `@mdx-js/loader` + `@mdx-js/react`.

**Rationale**:
- Topics need rich, repeatable building blocks — annotated images, callout boxes (Note / Tip / Warning), numbered step lists with screenshots, "For League Admins" badges. MDX lets authors drop a `<Callout type="warning">…</Callout>` or `<AnnotatedImage src=…>` directly into prose; the React component encapsulates the styling, accessibility, and lightbox behaviour.
- Tailwind already includes `.mdx` in its content globs (`tailwind.config.ts:5`), so the prose-class plumbing is already wired.
- The repo already uses TypeScript, App Router, and `next.config.mjs`; `@next/mdx` is the canonical Next.js integration and slots in without architecture change.
- Build-time evaluation means the rendered topic is just static HTML served by the standalone build — no MDX runtime cost per page view.

**Alternatives considered**:
- **Plain Markdown** — Authors couldn't render `<AnnotatedImage>` or `<Callout>` without HTML escape hatches, which would re-introduce styling inconsistencies the components exist to prevent.
- **Plain TSX pages** — Each topic becomes a `.tsx` file. Authors editing prose would be diffing JSX, which raises the bar to contributing. Mixing markup and content also makes copy review noisier.
- **External CMS (Sanity, Contentful)** — Spec assumes source-controlled content (see Assumptions block in spec.md). Adds an external dependency, an editor workflow, and a publish step. Excessive for ~30 topics and out of scope.

---

## R2. Discovery & search — build-time index + client-side Fuse vs. server route

**Decision**: Build-time manifest + JSON search index, queried client-side via Fuse.js.

**Rationale**:
- Corpus is small (≤ 30 topics × ~500 words = ~15 k tokens, ~50 kB index uncompressed, ~15 kB gz).
- Static between deploys — recomputing per request adds cost without changing the answer.
- Fuse.js is the de-facto small fuzzy matcher (≈ 5 kB gz client cost), supports weighted keys (title × 0.6, body × 0.4), threshold tuning, and per-result match locations for inline highlighting.
- Search latency target (<100 ms after keystroke, SC-006-ish) is trivial for Fuse on a 30-entry corpus — typical fuzzy match is sub-millisecond.

**Alternatives considered**:
- **`/api/help/search?q=…` route** — adds a TanStack Query call per keystroke; needs caching headers; serialises identical computations per user; offers no win for a static corpus.
- **Algolia / Typesense** — over-engineered; adds a third-party dependency and an indexing pipeline for content that fits on a single screen.
- **Hand-rolled token matcher** — saves the 5 kB but reinvents typo tolerance and ranking; not worth the bytes given Fuse's stability.

---

## R3. Visuals — annotation workflow & rendering

**Decision**: Annotations are baked into PNG screenshots offline (in Figma, Skitch, macOS Preview Markup, etc.) and dropped into `public/manual/img/<topic>/<name>.png`. The MDX renders them via `<AnnotatedImage>`, which wraps `next/image` and adds caption + click-to-enlarge.

**Rationale**:
- Single image per visual — no SVG overlay registry to maintain alongside the PNG.
- `next/image` already handles AVIF/WebP fallback, lazy loading, and explicit width/height to avoid CLS.
- Authors aren't blocked on engineering: anyone with a screenshot tool can produce a publishable visual.
- Each PNG has a sidecar `<name>.png.alt` text file in the same directory containing the canonical alt text. The build pipeline reads `.alt` when assembling the manifest and `AnnotatedImage` consumes it; this keeps the alt text version-controlled next to the asset and prevents authors from forgetting it (no `.alt` → CI fail).

**Alternatives considered**:
- **SVG overlays on raw screenshots** — Lets you adjust callout positions later, but doubles the asset count (PNG + SVG per visual) and requires per-image overlay markup in MDX. Premature for v1; revisit if annotation maintenance becomes painful.
- **Inline `<img>` with alt attribute on each call site** — Risks the alt text drifting from the image; the sidecar `.alt` is the source-of-truth approach used in several mature docs sites and keeps the asset and its accessible name in the same directory.
- **HTML5 `<figure>` with no React wrapper** — No mobile lightbox; no consistent caption styling. We'd have to manually re-implement the lightbox in every topic.

---

## R4. Routing model — single dynamic catch-all vs. one file per topic

**Decision**: Single dynamic catch-all at `src/app/(main)/help/[...slug]/page.tsx`. The route resolves the slug against the manifest at request time (statically generated at build time via `generateStaticParams`) and renders the corresponding MDX module.

**Rationale**:
- One renderer encapsulates the topic chrome (audience badge, breadcrumb, last-updated, "Back to <return-path>" affordance) and is the single place to evolve presentation.
- `generateStaticParams` lets every topic still be pre-rendered to static HTML at build time — same fast-paint and CDN-friendly profile as one-file-per-topic.
- Adding a new topic is a file drop into `src/content/manual/<section>/<slug>.mdx` plus an asset directory; no new route file required.

**Alternatives considered**:
- **One `page.tsx` per topic** — Topic-specific routing is overkill when the renderer is identical across topics; every new topic doubles as a code change in two places (MDX + route).
- **A single page with a topic switcher (no client routing)** — Breaks deep-linking from the contextual help affordance (FR-003), breaks browser back, breaks bookmarks. Non-starter.

---

## R5. Audience filtering — hide-admin-from-members or show-with-badge?

**Decision**: Always show the full table of contents to every signed-in user. Admin-only topics are labelled with a "For League Admins" badge. The TOC orders sections so that the role-appropriate sections come first: Members see Getting Started → Reading the App → League Admin (badged); Admins see Getting Started → League Admin → Reading the App.

**Rationale**:
- Spec FR-018 explicitly requires that members can read admin-section topics so they understand what their admin does.
- Hiding content would make contextual help links fragile: if a member visited an admin deep-link by accident, they'd hit a 404 instead of a legible page that explains they don't have access.
- The badge + reordering carries the role context without restricting access. Role detection comes from the existing `/api/auth/me` data already fetched by the sidebar — no new query needed.

**Alternatives considered**:
- **Hide admin section from non-admin users** — Violates FR-018 and creates a "phantom URL" problem for shared deep-links.
- **Two completely separate manuals (`/help-member`, `/help-admin`)** — Doubles the TOC and forces duplicate "Getting Started" content. Worse search experience too — admins searching for member-side concepts wouldn't find them in their manual.

---

## R6. Last-updated timestamp source — frontmatter vs. git mtime

**Decision**: Authors set `lastUpdated: YYYY-MM-DD` in the MDX frontmatter. The build pipeline validates the format and surfaces it to `TopicView`. Git `mtime` is **not** used as a fallback.

**Rationale**:
- `lastUpdated` is a content claim, not a mechanical artefact. An author tweaking prose without re-checking the screenshots shouldn't reset the timestamp; a screenshot refresh should.
- Git mtime is unreliable in monorepo workflows where unrelated files get touched (rebase, format, mass refactor) and would silently misrepresent freshness.
- Frontmatter timestamps appear in the diff during PR review — reviewers can challenge "did you actually re-check this against the live app?" when they see the date move.

**Alternatives considered**:
- **`git log -1 --format=%ad <file>`** — automated but lies. Rejected per above.
- **Auto-stamp on every PR via a hook** — same problem: a content-touching PR isn't necessarily a content-verifying PR.

---

## R7. Open-redirect defence on `?return=` query param

**Decision**: The manual's "Back to <previous page>" affordance reads a `return` query param. Before linking, `lib/manual/return-path.ts` parses the value with `URL`, requires it to be a relative path under the app, and rejects anything containing `:`, `//`, or `\` (case-insensitive). Default fallback is `/` when invalid or absent.

**Rationale**:
- The contextual help button writes `?return=<encoded current path>` when navigating to the manual. The manual then renders that as a clickable link. Without sanitisation a crafted link could redirect users off-site after they tap "Back".
- The parser is ~15 lines, fully unit-testable, and the default fallback is safe.

**Alternatives considered**:
- **Trust the param** — open-redirect vulnerability; trivially exploitable in phishing. Rejected outright.
- **Whitelist of known paths** — too rigid; the manual must work from any future page without a contracts update.

---

## R8. Image optimisation strategy

**Decision**: Author screenshots at 2× DPI (e.g. 1440px wide for a desktop screen captured on a Retina display). `next/image` handles downscaling, AVIF/WebP delivery, and `srcset`. We set explicit `width` and `height` on every `AnnotatedImage` to prevent layout shift.

**Rationale**:
- 2× DPI is enough resolution for the lightbox enlargement; below that, the enlarged view looks blurry. Above 2× (3×, 4×) the file sizes grow without perceptible benefit.
- `next/image` is already an unavoidable dependency of the codebase; no extra tooling needed.
- Explicit dimensions are required for SC-009 (mobile usability) and the lightbox to size correctly without a flash.

**Alternatives considered**:
- **Plain `<img>`** — no AVIF/WebP, no lazy loading, no `srcset`. Page weight balloons on screenshot-heavy topics.
- **Author-side WebP** — saves a tiny CDN cost but doubles the asset complexity; every screenshot needs both formats and fallback markup. `next/image` does this automatically.

---

## R9. Mobile lightbox

**Decision**: Custom lightweight component (`Lightbox.tsx`, ~80 lines): renders a full-screen overlay with the high-DPI image, a close button, a swipe-to-dismiss gesture on touch, and Esc-to-close on keyboard. Trap focus while open. No external dependency.

**Rationale**:
- The interaction is narrow (open image, close image) and we already need to control the styling, accessibility, and z-index relative to the existing AppShell drawer. A library would force more configuration than custom code.
- We get to make it inheritable to `<AnnotatedImage>` only — no global lightbox listener.

**Alternatives considered**:
- **`yet-another-react-lightbox`** — full-featured but ships several kilobytes for thumbnails, pagination, captions we already do in MDX. Overkill.
- **CSS-only modal** — no focus trap, no Esc, fails accessibility baseline (FR-022).

---

## R10. How to surface contextual help on feature pages

**Decision**: A single component, `<HelpButton topic="/help/standings" />`, mounted in the page header next to the page title on every member-facing and admin-facing feature page. Renders a circular "?" icon button (matching the existing icon system in `Sidebar.tsx`). Clicking it navigates to `/help/standings?return=<encoded current path>`.

**Rationale**:
- Single point of integration. Every page that calls `<HelpButton topic="…" />` automatically gets the deep-link, the return-path round-trip, and the accessibility treatment (aria-label, keyboard focus).
- The `topic` prop is the same string the manifest exposes as the topic URL; if a topic moves, an editor renames the directory and updates every `HelpButton` reference in one find-and-replace.
- Tests cover that 100% of feature pages call `<HelpButton>` via a build-time grep (lint rule or a unit test that imports the page module and asserts the component is present in the JSX tree).

**Alternatives considered**:
- **Floating help bubble (Intercom-style)** — visually intrusive, encourages drive-by support requests instead of self-serve reading.
- **Hover-only tooltip per page header** — fails keyboard / touch accessibility.

---

## R11. Search input keyboard model

**Decision**: A persistent search input at the top of the manual layout. Cmd/Ctrl-K from anywhere in the manual focuses the search input. Down/Up arrow navigates the results list; Enter opens the highlighted result; Esc closes the results list without losing focus.

**Rationale**:
- Cmd-K is the conventional doc-search shortcut (GitHub, Stripe, Linear); zero learning cost.
- Keyboard-only navigation is required by FR-021.
- Persistent input keeps the search field visible while reading a topic — re-querying is one keystroke away.

**Alternatives considered**:
- **Open a modal for search** — disrupts reading flow; an extra layer to dismiss before continuing.
- **Sidebar-only search** — same issue on mobile where the sidebar collapses into a drawer.

---

## R12. Where the "Help" sidebar entry lives

**Decision**: The "Help" entry is added to the existing `navGroups` in `src/components/layout/Sidebar.tsx` as a platform-scoped item (`platform: true` so the league slug prefix isn't applied) at the bottom of the navigation tree, just below "Admin". Visible on every signed-in surface — both inside and outside a league shell.

**Rationale**:
- The manual is universal content, not league-scoped, so it shouldn't be under `/l/<slug>/...`.
- Placing it adjacent to the existing Admin entry keeps "things I do" together and avoids inventing a new sidebar group for one link.
- The Sidebar already supports `platform: true` flags (see the `multiAdminItem` pattern in `Sidebar.tsx:241–246`) so this is a single-line conceptual change.

**Alternatives considered**:
- **A separate "Help" group at the top of the sidebar** — competes with primary navigation; the manual is referenced infrequently relative to Standings / Live / Transfers.
- **A floating "?" button in the corner** — clashes with the existing mobile drawer toggle, hard to discover for keyboard users.

---

## R13. Testing strategy

**Decision**: Four layers, all reusing existing test runners.

1. **Unit (`tests/unit/manual/`)** — frontmatter parser, search ranker, audience helper, return-path sanitiser. Vitest.
2. **Integration (none)** — no API surface to integration-test.
3. **Static check** — a `tests/unit/manual/help-button-coverage.test.ts` walks every page under `src/app/(main)/l/[leagueSlug]/...` and asserts each one imports `HelpButton`. Fails the build if a new feature page is added without contextual help (enforces SC-005).
4. **E2E (`tests/e2e/manual.spec.ts`)** — open via sidebar, navigate to a topic, use search, follow a contextual deep-link with a return path, verify "Back to <return-path>" works, verify mobile lightbox enlarges + dismisses.

**Rationale**:
- The static check is the most underrated win — it makes "every page has contextual help" a constant property of the codebase rather than something a reviewer has to remember.
- E2E is bounded and slow; using it for the one user-facing flow (open manual, find topic, return) rather than for content coverage keeps run time reasonable.

**Alternatives considered**:
- **Snapshot test every MDX page render** — too brittle; every prose tweak fails an unrelated test.
- **Visual regression on screenshots** — overkill for static images that are themselves under version control.

---

## R14. Manifest generation timing

**Decision**: The manifest (`src/content/manual/manifest.ts`) is generated by a build-time script invoked from `next.config.mjs` `webpack` hook (or, as the simpler equivalent, a `prebuild` npm script that runs before `next build`). The generated file is committed to the repo and treated as a build artefact — `.gitattributes` marks it `linguist-generated=true` so it doesn't pollute diffs.

**Rationale**:
- Static at build time → no runtime cost, no per-request scan of the `content/` directory.
- Committed → the repo always reflects the build output; `git diff` shows the manifest changing when topics are added/removed, which makes content PRs reviewable.
- Generated by script → authors can't forget to update the manifest; running `npm run dev` rebuilds it via the same hook.

**Alternatives considered**:
- **Read directory at request time** — fails in the standalone build (filesystem access varies); also a runtime cost where none is needed.
- **Hand-maintained manifest** — guaranteed to drift; one missed PR breaks the TOC for a release.

---

## Summary of decisions

| ID | Topic | Decision |
|---|---|---|
| R1 | Content format | MDX with frontmatter via `@next/mdx` |
| R2 | Search | Build-time JSON index + client-side Fuse.js |
| R3 | Visuals | PNG with baked-in annotations + sidecar `.alt` files |
| R4 | Routing | Single dynamic catch-all `/help/[...slug]` with `generateStaticParams` |
| R5 | Role labelling | Show everything, badge admin topics, reorder TOC by role |
| R6 | Last-updated | Frontmatter `lastUpdated`, no git mtime fallback |
| R7 | Open-redirect | Strict path sanitiser on `?return=` |
| R8 | Image optimisation | 2× DPI source, `next/image` for delivery, explicit dimensions |
| R9 | Lightbox | Custom ~80-line component, no external dep |
| R10 | Contextual help | `<HelpButton topic="…">` mounted in every page header |
| R11 | Search keyboard model | Cmd-K focus, arrow nav, Enter open, Esc close |
| R12 | Sidebar entry | Platform-scoped "Help" entry under existing nav, below Admin |
| R13 | Tests | Unit + static help-coverage + targeted E2E |
| R14 | Manifest | Build-time generator, committed output |

All open NEEDS CLARIFICATION items from the spec are resolved (the spec didn't emit any, and the Technical Context in `plan.md` lists no remaining unknowns). Ready for Phase 1.
