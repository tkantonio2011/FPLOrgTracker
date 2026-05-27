---
description: "Task list for 003-user-manual"
---

# Tasks: In-App User Manual

**Input**: Design documents from `D:\Development\EnergyOne\FPLOrgTracker\specs\003-user-manual\`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: Tests are explicitly required by the plan's testing strategy (`research.md` R13) and by the spec's accessibility / coverage success criteria. Unit + targeted E2E only — no contract or integration tests because the feature exposes no API.

**Organization**: Tasks are grouped by user story. US1 and US2 are co-equal P1 and can be staffed in parallel after Phase 2 completes.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1–US5)
- Include exact file paths in every task description

## Path Conventions

Single Next.js codebase. Paths are relative to repo root unless absolute. New code lives under `src/app/(main)/help/`, `src/components/manual/`, `src/content/manual/`, `src/lib/manual/`, `public/manual/img/`, and `tests/{unit,e2e}/manual/`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Wire the new dependencies and config so subsequent work can compile.

- [X] T001 Install runtime + author-tool deps: `npm install @next/mdx @mdx-js/loader @mdx-js/react @tailwindcss/typography gray-matter fuse.js` and dev dep `@types/mdx`. Verify `npm install` exits clean and the new entries appear in `package.json`.
- [X] T002 Enable MDX in `next.config.mjs`: wrap the existing `nextConfig` with `nextMDX({ extension: /\.mdx?$/ })`, and add `pageExtensions: ["ts", "tsx", "js", "jsx", "mdx"]`. Preserve the existing `experimental.instrumentationHook`, `output: "standalone"`, and `outputFileTracingIncludes`.
- [X] T003 [P] Enable typography plugin in `tailwind.config.ts`: import `@tailwindcss/typography` and add to `plugins: [typography]`. `content` already covers `.mdx` files — no change to globs.
- [X] T004 Add `"prebuild": "tsx scripts/build-manual-index.ts"` to `package.json` `scripts`. Verify `npm run build` still completes (script may be a no-op stub at this point).
- [X] T005 [P] Create the directory skeleton: `src/app/(main)/help/`, `src/content/manual/`, `src/components/manual/`, `src/lib/manual/`, `public/manual/img/`, `tests/unit/manual/`. Drop a `.gitkeep` in each so they survive an empty commit.
- [X] T006 [P] Create the redirects table at `src/lib/manual/redirects.ts` exporting `export const manualRedirects: Record<string, string> = {};` (empty for v1; future renames populate it).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Build the pipeline (manifest + search index generator), the topic renderer, the MDX-exposed components, the manual layout, and the sidebar entry. After this phase, the manual exists as an empty shell — both content stories (US1, US2) can begin.

**⚠️ CRITICAL**: No US1/US2/US3/US4 work can begin until this phase is complete.

### Manifest + content pipeline

- [X] T007 Implement frontmatter parser + topic loader in `src/lib/manual/load-topics.ts`. Reads every `**/*.mdx` under `src/content/manual/`, parses frontmatter with `gray-matter`, validates per `contracts/topic-frontmatter.md` field rules (title length, audience enum, lastUpdated format/not-future, slug regex), and returns a typed `LoadedTopic[]`. Throws on the first violation with `[manifest] <path>: <reason>`.
- [X] T008 [P] Define shared types in `src/lib/manual/types.ts`: `Audience`, `ManifestTopic`, `ManifestSection`, `ManualManifest`, `SearchIndexEntry`, `SearchIndex` — copied verbatim from `data-model.md`.
- [X] T009 Implement the manifest + search-index generator at `scripts/build-manual-index.ts`. Walks `src/content/manual/`, calls `load-topics.ts`, reads `_section.json` per section, sorts by numeric prefix, resolves `relatedTopics` against the topic set (fails on unresolved refs), validates every referenced `<AnnotatedImage src=…>` against the filesystem and asserts a sibling `.alt` exists, emits `src/content/manual/manifest.ts` and `src/content/manual/search-index.json`. Strips JSX from MDX body, caps to 5000 chars per entry for the search index, and stamps `generatedAt` ISO timestamp.
- [X] T010 [P] Unit test the frontmatter parser at `tests/unit/manual/load-topics.test.ts`. Cases: valid frontmatter passes; missing required field fails with the documented message; `audience` outside enum fails; `lastUpdated` in the future fails; slug collision within a section fails; unknown frontmatter fields are tolerated.
- [X] T011 [P] Unit test the manifest generator at `tests/unit/manual/build-manual-index.test.ts`. Cases: section ordering by numeric prefix; topic ordering within section; `relatedTopics` resolution failure; missing image referenced by `<AnnotatedImage>` fails; image without `.alt` sidecar fails.

### Lib helpers

- [X] T012 [P] Implement `safeReturnPath(raw)` in `src/lib/manual/return-path.ts` per the algorithm in `data-model.md` → ReturnPath. Default returns `/`. Also export `prettyNameForPath(path): string` with a small mapping table for the common feature paths (Standings, Live Points, …).
- [X] T013 [P] Implement audience helpers in `src/lib/manual/audience.ts`: `orderSectionsForRole(sections, role): ManifestSection[]` (admins see admin section first; members see admin section last) and `audienceBadge(audience): { label, className } | null` for rendering the "For League Admins" / "For Members" chips.
- [X] T014 [P] Unit test `safeReturnPath` at `tests/unit/manual/return-path.test.ts`. Cases: valid relative path returns as-is; `null` / `undefined` / empty → `/`; `//evil.example` → `/`; `https://evil` → `/`; `/path\\..\\..\\..\\etc\\passwd` → `/`; control characters → `/`; >1024 chars → `/`; URL-encoded paths decode correctly.
- [X] T015 [P] Unit test audience helper at `tests/unit/manual/audience.test.ts`. Cases: admin user → admin section appears before reading-the-app; member user → admin section appears after; `both` topics retain natural order; unknown audience → fallback to bottom.

### MDX-exposed components

- [X] T016 [P] Implement `<AnnotatedImage>` in `src/components/manual/AnnotatedImage.tsx`. Wraps `next/image`, accepts `{ src, caption?, alt?, width?, height? }`, resolves `src` against `/manual/img/`, reads the alt text from the sidecar file at build time (via a small webpack/Next loader OR by generating an `alt-map.json` in the prebuild step — pick whichever has a simpler diff; the loader is preferred), shows caption in `text-sm text-slate-500`, and opens `<Lightbox>` on click.
- [X] T017 [P] Implement `<Lightbox>` in `src/components/manual/Lightbox.tsx`. ~80 lines. Full-screen overlay rendering the high-DPI image, close button (X), Esc-to-close, swipe-to-dismiss on touch, focus trap while open. No external dependency.
- [X] T018 [P] Implement `<Callout type="note"|"tip"|"warning">` in `src/components/manual/Callout.tsx`. Three colour variants matching the existing FPL palette (purple for note, green for tip, amber for warning). Renders an icon, a heading derived from `type`, and the children as prose.
- [X] T019 [P] Implement `<Steps>` and `<Step title="…">` in `src/components/manual/Steps.tsx`. `<Steps>` renders an ordered list with auto-incremented step numbers; `<Step>` renders an item with title + body (which may contain an `<AnnotatedImage>`).
- [X] T020 [P] Implement `<KeyboardShortcut keys={['Cmd', 'K']}>` in `src/components/manual/KeyboardShortcut.tsx`. Renders inline `<kbd>` elements joined by `+`. OS-aware (`Cmd` on macOS, `Ctrl` elsewhere) via a `navigator.userAgent` check.
- [X] T021 Configure the MDX provider so the components above are available without per-topic imports. Add `src/components/manual/mdx-components.tsx` exporting `useMDXComponents()` and ensure it is consumed by the App Router's MDX integration. Reference: Next.js App Router MDX docs.

### Layout, route renderer, and welcome page

- [X] T022 [P] Implement `<ManualTOC>` in `src/components/manual/ManualTOC.tsx`. Takes the `ManualManifest` + the current user's role (resolved from `/api/auth/me` data, the same query the Sidebar already issues) and renders sections in role-appropriate order. Each topic row shows title + audience badge. Highlights the currently-active topic from `usePathname()`.
- [X] T023 [P] Implement `<TopicView>` in `src/components/manual/TopicView.tsx`. Takes a `ManifestTopic` + rendered MDX body. Renders: breadcrumb (`Help → <section> → <topic>`), title, audience badge, "Last updated YYYY-MM-DD", optional "Back to <pretty name>" link from `?return=` (read via `useSearchParams()` and passed through `safeReturnPath`), the MDX body inside a `prose` container with project-specific overrides, and a "Related topics" footer from `relatedTopics`.
- [X] T024 Implement `<ManualLayout>` in `src/components/manual/ManualLayout.tsx`. Two-column layout: left column = `<ManualTOC>` + a search slot (occupied later by `<ManualSearch>` in US3 — for now, render `null` or a placeholder so the column doesn't collapse); right column = `{children}`. Mobile: TOC collapses into a drawer triggered by a button in the page header.
- [X] T025 Create `src/app/(main)/help/layout.tsx` that wraps every manual route in `<ManualLayout>` and reads the manifest at module load (statically imported). Default page metadata: `title: "Help"`.
- [X] T026 [P] Create `src/app/(main)/help/page.tsx` (welcome). Renders the section grid: one card per `ManifestSection` showing title, summary, primary-audience badge, and topic count. Each card links to `/help/<section.id>`.
- [X] T027 Create the dynamic route at `src/app/(main)/help/[...slug]/page.tsx`. Resolves `slug` to either (a) a section overview if the slug has one segment, or (b) a topic if the slug has two segments. Exports `generateStaticParams()` from the manifest so every section + topic is pre-rendered at build time. Honours `manualRedirects` from `src/lib/manual/redirects.ts` — emits a 308 for renamed paths. 404 on unresolved slug. For topics, dynamically `import()` the MDX module by path.

### Sidebar entry

- [X] T028 Modify `src/components/layout/Sidebar.tsx`: add a new `HelpIcon` inline SVG following the existing icon pattern (see `SettingsIcon`, `LayersIcon`). Append `{ path: "/help", label: "Help", icon: <HelpIcon />, platform: true }` to the final `navGroups` entry (the one currently containing only the `/admin` item), placed before the existing `/admin` link. Verify the entry is visible on every page (in-league shells AND on `/leagues`, `/my-admin`, `/platform`).

**Checkpoint**: Foundation ready. `npm run dev` boots; visiting `/help` shows an empty TOC; visiting any `/help/<section>/<topic>` would 404 because no content exists yet. Both US1 and US2 can now start in parallel.

---

## Phase 3: User Story 1 — Member learns the app from inside it (Priority: P1) 🎯 MVP

**Goal**: A signed-in member can open the manual from the sidebar, see a table of contents organised for them, and read explanations of every member-facing feature page, each illustrated with at least one annotated screenshot.

**Independent Test**: Sign in as a member who is not an admin. Click "Help" in the sidebar. Verify the welcome page lists "Getting Started" and "Reading the App" sections at the top. Open each of: Standings, Live Points, Transfers, Bench Waste, Differentials. Verify each renders with at least one `<AnnotatedImage>` reflecting the live UI.

### Content — Getting Started

- [X] T029 [P] [US1] Create `src/content/manual/00-getting-started/_section.json` with `{ id: "getting-started", title: "Getting Started", summary: "What this platform is and how to sign in.", primaryAudience: "both" }`.
- [X] T030 [US1] Author the five Getting Started topics under `src/content/manual/00-getting-started/`: `01-welcome.mdx`, `02-magic-link.mdx`, `03-switching-leagues.mdx`, `04-accepting-an-invitation.mdx`, `05-troubleshooting-sign-in.mdx`. Each topic includes valid frontmatter per `contracts/topic-frontmatter.md`, intro paragraph, prose body, and at least one `<AnnotatedImage>` except `02-magic-link.mdx` and `05-troubleshooting-sign-in.mdx` which may use a `<Callout>` instead where a screenshot would not aid comprehension.
- [X] T031 [US1] Capture and annotate screenshots for the five Getting Started topics. For each: produce one or more PNGs at 2× DPI under `public/manual/img/<topic-slug>/`, plus a `<filename>.png.alt` sidecar text file. `welcome/` ≥ 1 screenshot showing the post-sign-in landing; `switching-leagues/` ≥ 1 showing the LeagueSwitcher dropdown open; `accepting-an-invitation/` ≥ 1 showing the `/invitations/<token>` page.

### Content — Reading the App

- [X] T032 [P] [US1] Create `src/content/manual/10-reading-the-app/_section.json` with `{ id: "reading-the-app", title: "Reading the App", summary: "Every analytics and standings page, explained.", primaryAudience: "member" }`.
- [X] T033 [US1] Author the three Gameweek topics under `src/content/manual/10-reading-the-app/`: `01-standings.mdx`, `02-live-points.mdx`, `03-transfers.mdx`. Each has frontmatter including `featurePagePath`, an intro paragraph, prose explaining columns / metrics / interactions, and at least one annotated `<AnnotatedImage>`. Add matching screenshot directories under `public/manual/img/<topic-slug>/` with PNG + `.alt` sidecar.
- [X] T034 [US1] Author the ten Season topics under `src/content/manual/10-reading-the-app/`: `04-form-table.mdx`, `05-season-stats.mdx`, `06-bench-waste.mdx`, `07-captain-history.mdx`, `08-h2h.mdx`, `09-regret.mdx`, `10-agony.mdx`, `11-luck.mdx`, `12-captain-whatif.mdx`, `13-wall-of-shame.mdx`. Each follows the same shape as T033 with frontmatter + intro + prose + ≥1 `<AnnotatedImage>`. Matching screenshot directories under `public/manual/img/`.
- [X] T035 [US1] Author the four Scout topics under `src/content/manual/10-reading-the-app/`: `14-fixtures.mdx`, `15-ownership.mdx`, `16-differentials.mdx`, `17-injuries.mdx`. Same shape. Matching screenshot directories under `public/manual/img/`.

**Checkpoint**: Every member-facing feature page has a corresponding topic in the manual with at least one annotated screenshot. A first-time member can navigate from `/help` to any member-facing surface's documentation and follow the prose against the live app. SC-002 and SC-004 (member half) are verifiable.

---

## Phase 4: User Story 2 — League Admin learns admin tasks (Priority: P1)

**Goal**: A user holding the League Admin role on at least one league can navigate to a clearly labelled "League Admin" section in the manual and find step-by-step procedures, each illustrated with annotated screenshots of the relevant admin screens.

**Independent Test**: Sign in as a League Admin in one league. Open the manual; verify the "League Admin" section appears in the TOC. Open the "Invite a member" topic and follow its steps against the live `/l/<slug>/admin/members` page — the documented sequence MUST match the live UI and the test invitation MUST send successfully.

### Content — League Admin

- [X] T036 [P] [US2] Create `src/content/manual/20-league-admin/_section.json` with `{ id: "league-admin", title: "League Admin", summary: "Everything you need to administer a league.", primaryAudience: "admin" }`.
- [X] T037 [US2] Author the three onboarding topics under `src/content/manual/20-league-admin/`: `01-overview.mdx`, `02-league-settings.mdx`, `03-syncing-members.mdx`. Each: frontmatter (audience: admin, featurePagePath where applicable), intro, prose, ≥1 annotated `<AnnotatedImage>` per topic. `01-overview.mdx` summarises the admin role and links to `02`/`03`. Matching screenshots under `public/manual/img/`.
- [X] T038 [US2] Author the two member-management topics: `04-inviting-members.mdx` and `05-editing-members.mdx`. Step-by-step procedures using `<Steps>` + `<Step>` with embedded screenshots showing the invite flow, the email format, and the member-edit modal. Matching screenshots under `public/manual/img/`.
- [X] T039 [US2] Author the three operations topics: `06-weekly-digest.mdx`, `07-audit-log.mdx`, `08-suspended-league.mdx`. `06-weekly-digest.mdx` MUST include the SMTP environment-variable list and a screenshot of the "Digest configured" banner per FR-009. `08-suspended-league.mdx` documents what an admin sees and can/can't do when their league is suspended. Matching screenshots under `public/manual/img/`. Add a `<Callout type="warning">` to `08` for the destructive actions (no admin can suspend their own league from this screen).

**Checkpoint**: The admin section is complete. A newly promoted League Admin can complete the three most common admin tasks (settings, invite, digest) using only the manual as guidance — SC-003 is verifiable. SC-004 (admin half) is met.

---

## Phase 5: User Story 3 — Search inside the manual (Priority: P2)

**Goal**: A user with the manual open can type a query into a persistent search input and see ranked results as they type, with a graceful no-results state.

**Independent Test**: With the manual open, type "deduction" → the "Editing members" topic appears within ~100 ms. Type "magic link" → the Getting Started topic appears. Type "nonsense-query-xyz" → a "no matches" message lists the most popular topics as a fallback. Press Cmd+K (Ctrl+K on Windows) from any manual page → the search input focuses without scrolling.

### Implementation for US3

- [X] T040 [P] [US3] Implement `src/lib/manual/search.ts`: import `search-index.json`, instantiate a `Fuse` with `{ keys: [{ name: "title", weight: 0.5 }, { name: "summary", weight: 0.3 }, { name: "body", weight: 0.2 }], threshold: 0.4, includeMatches: true }`. Export a typed `searchManual(query: string): SearchResult[]` and a `popularTopics(n = 5)` helper that returns the first N topics from the manifest as the fallback.
- [X] T041 [US3] Implement `<ManualSearch>` in `src/components/manual/ManualSearch.tsx`. Debounced input (150 ms), forwards to `searchManual`, opens a results panel below the input. Keyboard model: Up/Down to navigate results, Enter to open the highlighted result, Esc to close the panel without losing input focus.
- [X] T042 [P] [US3] Implement `<ManualSearchResults>` in `src/components/manual/ManualSearchResults.tsx`. Renders each result as a card with title, audience badge, summary excerpt, and the matched snippet from `body` with the query terms highlighted (using Fuse's `matches`). Renders the "no matches — popular topics" fallback when results are empty.
- [X] T043 [US3] Wire `<ManualSearch>` into `<ManualLayout>` (T024 left a placeholder slot). Position: top of the left column, above `<ManualTOC>`. On mobile, the search field stays visible in the drawer header.
- [X] T044 [P] [US3] Implement the Cmd-K shortcut in `src/lib/manual/use-search-shortcut.ts` (custom hook) and consume it from `<ManualLayout>`. OS detection via `navigator.userAgent`; preventDefault on the keystroke; focus the search input.
- [X] T045 [P] [US3] Unit test the search ranker at `tests/unit/manual/search.test.ts`. Cases: exact title match ranks first; prefix match ranks above substring; substring match above fuzzy; no-match returns empty array; query under 2 chars returns the popular fallback; weighted ranking — a hit in `title` outranks a hit only in `body` of equal length.

**Checkpoint**: Search works as a first-class navigation method. SC-006 (90% of queries surface the correct topic in the top three) is verifiable.

---

## Phase 6: User Story 4 — Contextual help from feature pages (Priority: P2)

**Goal**: Every member-facing and admin-facing feature page mounts a small `<HelpButton>` next to its title; clicking it opens the corresponding manual topic and shows a "Back to <previous page>" link at the top.

**Independent Test**: Visit each page in `contracts/help-button.md` → coverage list. Confirm each shows a "?" affordance next to the title. Click it; verify the manual opens at the right topic and that "Back to <pretty name>" links back to the originating page. Run `tests/unit/manual/help-button-coverage.test.ts` — it MUST pass green for every page in the coverage list.

### Implementation for US4

- [X] T046 [P] [US4] Implement `<HelpButton>` in `src/components/manual/HelpButton.tsx` per `contracts/help-button.md`. Props: `{ topic: string, ariaLabel?: string, size?: "sm" | "md" }`. Renders a circular `<Link>` to `${topic}?return=${encodeURIComponent(pathname)}` with the "?" SVG; `aria-label` defaults to "Help on this page"; hover/focus states match the existing icon-button treatment in `Sidebar.tsx`.
- [X] T047 [US4] Add `<HelpButton>` to the three Gameweek pages: `src/app/(main)/l/[leagueSlug]/standings/page.tsx` (topic `/help/reading-the-app/standings`), `…/live/page.tsx` (`/help/reading-the-app/live-points`), `…/transfers/page.tsx` (`/help/reading-the-app/transfers`). Place inside the page header next to the `<h1>`.
- [X] T048 [US4] Add `<HelpButton>` to the ten Season pages under `src/app/(main)/l/[leagueSlug]/`: `form/page.tsx`, `season-stats/page.tsx`, `bench/page.tsx`, `captain-history/page.tsx`, `h2h/page.tsx`, `regret/page.tsx`, `agony/page.tsx`, `luck/page.tsx`, `captain-whatif/page.tsx`, `wall-of-shame/page.tsx`. Each `topic` prop points at the matching `/help/reading-the-app/<slug>`.
- [X] T049 [US4] Add `<HelpButton>` to the four Scout pages: `fixtures/page.tsx`, `ownership/page.tsx`, `differentials/page.tsx`, `player-status/page.tsx` (which maps to `/help/reading-the-app/injuries`).
- [X] T050 [US4] Add `<HelpButton>` to the four Admin pages: `src/app/(main)/l/[leagueSlug]/admin/settings/page.tsx`, `…/admin/members/page.tsx`, `…/admin/digest/page.tsx`, `…/admin/audit/page.tsx`. Each `topic` prop points at the matching `/help/league-admin/<slug>`.
- [X] T051 [US4] Add `<HelpButton>` to the two cross-league pages: `src/app/(main)/my-admin/page.tsx` (topic `/help/league-admin/overview`) and `src/app/(main)/leagues/page.tsx` (topic `/help/getting-started/switching-leagues`).
- [X] T052 [US4] Implement the coverage test at `tests/unit/manual/help-button-coverage.test.ts`. Reads the page-paths list defined in `contracts/help-button.md`, dynamically imports each module, walks the rendered JSX tree (or imports inspection via the TypeScript compiler API or a regex on the file content — pick the simpler approach), and asserts `<HelpButton>` is present. Fails with `[help-button-coverage] page <path> does not import HelpButton` on any miss.

**Checkpoint**: SC-005 (100% of feature pages have a contextual help affordance deep-linking to the correct topic) is met and enforced by the coverage test. The "moment-of-need" path from feature page → manual topic → back to the same feature page is wired end-to-end.

---

## Phase 7: User Story 5 — Manual stays trustworthy as the app evolves (Priority: P3)

**Goal**: Every release that ships a UI change also ships the matching documentation update. Readers see a "Last updated" stamp on every topic so they can judge freshness at a glance.

**Independent Test**: Open any topic — the "Last updated YYYY-MM-DD" stamp is visible. After a release that ships a UI change, the matching topic's stamp is no older than that release. Reviewers can challenge a PR that changes a screen without also updating the matching topic.

### Implementation for US5

- [X] T053 [P] [US5] Confirm the "Last updated" timestamp from frontmatter renders prominently in `<TopicView>` (already implemented in T023 — this is a verification task, not a new code task). If missing, add it: position immediately under the audience badge in a `text-xs text-slate-500` row.
- [ ] T054 [P] [US5] Document the release-time discipline in `docs/CONTRIBUTING.md` (or create it if absent). New section "Documentation as a release artefact": every PR that modifies a file under `src/app/(main)/l/[leagueSlug]/...` or `src/app/(main)/{my-admin,leagues,platform}/...` MUST either (a) update the matching MDX topic and bump its `lastUpdated`, or (b) include an explicit comment in the PR description explaining why the screen change does not warrant a doc change. Reviewers enforce.
- [ ] T055 [P] [US5] Add an opt-in advisory warning in CI: a Bash/PowerShell script under `scripts/check-doc-coverage.sh` (or `.ps1`) that compares the changed files in a PR against the manual content directory; emits a non-blocking warning when a member/admin screen changed without a matching topic change. The script is opt-in (commented out in the CI config) for the first release cycle; if useful, promote to blocking in a follow-up.

**Checkpoint**: SC-007 (manual's last-updated never lags the live UI by more than one release cycle) becomes verifiable. The advisory warning gives reviewers a concrete trigger to ask "is this also a doc change?"

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: End-to-end verification, accessibility, mobile, and a final sweep against the spec's success criteria.

- [ ] T056 [P] Implement the E2E spec at `tests/e2e/manual.spec.ts`. Cases: (a) sign in → click "Help" sidebar entry → land at `/help` welcome; (b) navigate to a topic → screenshot is present; (c) click a `<HelpButton>` on `/l/<slug>/standings` → `/help/reading-the-app/standings?return=...` opens with "Back to Standings" link; (d) click "Back to Standings" → return to the originating page; (e) type a query in the search field → result appears in <100 ms; (f) press Cmd-K (or Ctrl-K) → search input focuses; (g) on a mobile viewport (375×667), tap an `<AnnotatedImage>` → lightbox opens; Esc → closes; (h) navigate to a non-existent topic → renders the 404 inside `AppShell` (not a bare browser error).
- [ ] T057 [P] Accessibility sweep: run axe-core (or browser devtools accessibility audit) against `/help`, a section page, and a topic page. Verify: colour contrast on prose + audience badges; alt text on every rendered image; focus indicators on TOC links, search input, search results, `<HelpButton>`, lightbox close button; keyboard-only navigation from sidebar → manual → topic → back. Capture any findings and fix.
- [ ] T058 [P] Mobile audit: at 375×667 (iPhone SE) and 414×896 (iPhone 11), verify the manual layout, the TOC drawer toggle, the search field, and the lightbox all work without horizontal scrolling. Confirm screenshots are tappable and the enlarged view sizes correctly.
- [ ] T059 Run the quickstart end-to-end: follow every step in `specs/003-user-manual/quickstart.md` from a fresh checkout of the branch. Fix any drift between the document and reality. Update `quickstart.md` if commands or paths changed during implementation.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately.
- **Foundational (Phase 2)**: Depends on Setup — blocks every user story.
- **US1 (Phase 3) and US2 (Phase 4)**: Depend on Foundational. Both are co-equal P1 and can be staffed in parallel.
- **US3 (Phase 5)**: Depends on Foundational. Can run in parallel with US1 / US2; depends on the manifest + search-index emitted by T009 but does not require any content to exist.
- **US4 (Phase 6)**: Depends on Foundational. Tasks T047–T051 (HelpButton wiring) link to topic paths — those topics ideally exist (from US1 / US2) but technically the wiring can land first; clicks just 404 until content lands.
- **US5 (Phase 7)**: Depends on Foundational and US1+US2 (a "last updated" stamp needs at least one real topic to display on).
- **Polish (Phase 8)**: Depends on US1, US2, US3, US4 being functionally complete.

### Within Each User Story

**Inside Foundational (T007–T028)**:
- T007 → T009 (manifest generator imports the loader).
- T008 is independent and can land first or in parallel.
- T012 / T013 / T016–T020 are all independent — parallelisable.
- T021 depends on T016–T020 (the MDX provider exposes them).
- T022 depends on the manifest (T009) and audience helper (T013).
- T023 depends on `<AnnotatedImage>` (T016), `<Callout>` (T018), and `safeReturnPath` (T012).
- T024 depends on T022 (TOC). T025 depends on T024. T026 / T027 depend on T025.
- T028 (sidebar) is independent of the renderer; it can land in parallel with anything.
- Unit tests (T010, T011, T014, T015) can land alongside the code they test.

**Inside US1 (T029–T035)** and **US2 (T036–T039)**: each task is a distinct content unit and parallelisable. Authors can split topics across people freely.

**Inside US3 (T040–T045)**:
- T040 first (search lib).
- T041 depends on T040. T042 depends on T041. T043 depends on T041+T042.
- T044 is independent. T045 (tests) is independent.

**Inside US4 (T046–T052)**:
- T046 first (the `<HelpButton>` component itself).
- T047–T051 all depend on T046 but are mutually independent — wiring different page files. Parallelisable across people.
- T052 (coverage test) can be authored alongside the wiring; it fails red until every page is wired.

### Parallel Opportunities

- All Setup tasks marked [P] can run in parallel after T001 (deps install).
- Foundational: lib helpers (T012–T015), MDX components (T016–T020), unit tests (T010, T011, T014, T015), and the sidebar entry (T028) all parallelisable. The route/layout stack (T022–T027) is mostly sequential due to component composition.
- US1 + US2 + US3 + US4 (component-only parts) can all proceed in parallel after Foundational.

---

## Parallel Example: Foundational MDX components

```bash
# Five distinct files; no shared state. Launch in parallel:
Task: "Implement <AnnotatedImage> in src/components/manual/AnnotatedImage.tsx (T016)"
Task: "Implement <Lightbox> in src/components/manual/Lightbox.tsx (T017)"
Task: "Implement <Callout> in src/components/manual/Callout.tsx (T018)"
Task: "Implement <Steps>/<Step> in src/components/manual/Steps.tsx (T019)"
Task: "Implement <KeyboardShortcut> in src/components/manual/KeyboardShortcut.tsx (T020)"
```

## Parallel Example: US1 content

```bash
# Three different sections, no shared files. Three authors in parallel:
Task: "Author Getting Started topics + screenshots (T030–T031)"
Task: "Author Reading the App / Gameweek topics (T033)"
Task: "Author Reading the App / Season topics (T034)"
```

## Parallel Example: US4 page wiring

```bash
# Distinct page files, no cross-file edits. Four small PRs in parallel:
Task: "Wire HelpButton into Gameweek pages (T047)"
Task: "Wire HelpButton into Season pages (T048)"
Task: "Wire HelpButton into Scout pages (T049)"
Task: "Wire HelpButton into Admin + cross-league pages (T050, T051)"
```

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Complete Phase 1: Setup.
2. Complete Phase 2: Foundational. (~22 tasks, mostly small.)
3. Complete Phase 3: User Story 1 — Member content.
4. **STOP and VALIDATE**: Open the manual as a non-admin member. Confirm Getting Started + Reading the App topics render with screenshots. SC-001, SC-002, SC-004 (member half) verifiable.
5. Ship to staging / production as a vertical slice: the manual exists, members can use it, admins can read it but it lacks dedicated admin content.

### Incremental Delivery

1. **Foundational → US1 → Ship**: members get the manual. (MVP.)
2. **US2 → Ship**: admin section appears. SC-003 met.
3. **US3 → Ship**: search arrives. SC-006 met.
4. **US4 → Ship**: contextual help affordances on every page; the "moment-of-need" flow is live. SC-005 met.
5. **US5 → Ship**: the freshness discipline is documented and (optionally) tooled. SC-007 met.
6. **Polish → Ship**: E2E + accessibility + mobile audits land; manual is production-grade.

### Parallel Team Strategy

Three contributors, after Foundational completes:

- **Author A** (content-focused): US1 (T029–T035) → US2 (T036–T039) sequentially. Carries the heaviest writing load.
- **Author B** (engineering-focused): US3 (T040–T045) → US4 (T046–T052) sequentially. All component / wiring work.
- **Author C** (review / coverage): T010 / T011 / T014 / T015 / T045 / T052 (the test tasks across all stories), then Polish (T056–T059).

Stories complete in priority order but contributors don't block on each other beyond the Foundational gate.

---

## Notes

- [P] tasks = different files, no upstream deps in their phase.
- [Story] label maps task to user story for traceability (US1–US5).
- Each user story is independently testable per its **Independent Test** clause in the spec.
- Verify unit tests fail before implementing where TDD is feasible; the coverage test (T052) is the most natural red-green target — author it first, watch it fail, then wire pages until it passes.
- Commit per logical task or small group — content tasks naturally commit per topic.
- Stop at any checkpoint to validate the story independently before moving on.
- Avoid: vague tasks ("write some admin docs"), cross-phase coupling that breaks story independence, dropping the `lastUpdated` bump when refreshing a screenshot.
