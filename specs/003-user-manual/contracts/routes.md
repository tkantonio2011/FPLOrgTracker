# Contract: Manual URL Routes

**Phase**: 1 — Design / Contracts
**Audience**: Engineers, content authors, anyone linking into the manual from external surfaces (e.g. the digest email)
**Status**: Stable for v1

URLs in the manual are part of the public contract. Bookmarks, the contextual `HelpButton`, the future digest email, and any third-party docs that link in all assume these are durable.

---

## Canonical URL shape

```
/help                                       — Welcome / table of contents
/help/<section-slug>                        — Section overview (a TOC of that section's topics)
/help/<section-slug>/<topic-slug>           — A single topic
/help/<section-slug>/<topic-slug>?return=…  — A topic opened via HelpButton from a feature page
```

`section-slug` and `topic-slug` are kebab-case, lowercase, ASCII letters / digits / hyphens.

### Reserved sub-paths

| Path | Reserved for | Status |
|---|---|---|
| `/help/search` | Future server-side search (if the corpus ever outgrows client-side Fuse) | Reserved — do **not** use as a topic slug |
| `/help/_index` | Future debug surface | Reserved — do not use |

---

## Examples

```
/help
/help/getting-started
/help/getting-started/magic-link
/help/getting-started/switching-leagues
/help/reading-the-app/standings
/help/reading-the-app/captain-whatif
/help/league-admin
/help/league-admin/invite-members
/help/league-admin/weekly-digest
```

---

## Behaviour by route

### `GET /help`

- Renders the welcome page.
- Shows the section grid (one card per Section) with title, summary, primary-audience badge, and topic count.
- Includes the persistent search input.
- Status: 200 always (no auth-level differentiation; all signed-in users see all sections).
- Unauthenticated: redirected to `/sign-in?redirect=/help` by the existing `(main)` layout's session check — no special handling required by the manual itself.

### `GET /help/<section-slug>`

- Renders the section overview.
- Shows section title, summary, and the ordered list of topics in that section with each topic's title, summary, and audience badge.
- Includes a breadcrumb (`Help → <section title>`) and the persistent search input.
- 200 if the section exists in the manifest.
- **404 if the section-slug does not match any section** — falls through to Next.js's default 404 page wrapped in the standard `AppShell`.

### `GET /help/<section-slug>/<topic-slug>`

- Renders the topic.
- Shows: breadcrumb (`Help → <section> → <topic>`), topic title, audience badge, `lastUpdated`, the MDX body, and a "Related topics" footer.
- 200 if the topic exists.
- 200 with a "Back to <pretty name>" link at the top **iff** the `return` query parameter is present AND passes `safeReturnPath` validation.
- **404 if the section or topic does not match.** A topic moved via a redirect (see [topic-frontmatter.md → Renaming a topic](topic-frontmatter.md#renaming-a-topic)) is a 308 from the old slug to the new.

---

## Query parameters

### `return`

```
/help/reading-the-app/standings?return=%2Fl%2Fsandsharks%2Fstandings
```

| Property | Value |
|---|---|
| Type | URL-encoded relative path |
| Validation | Must start with `/`. Must not start with `//`. Must not contain `\` or `:`. Must not contain control characters. |
| Length cap | 1024 chars after decode |
| Invalid / absent | Treated as missing; no "Back" link rendered |
| Trust boundary | The validation sanitiser (`safeReturnPath`) treats `?return=` as untrusted input and never reflects the raw value into the DOM — only its sanitised form |

Behaviour:

- If valid and the path maps to a known surface, the rendered link reads "Back to <Standings>" with the pretty name from the mapping table in `src/lib/manual/return-path.ts`.
- If valid but the path is not recognised, the rendered link reads "Back to where you were" with the sanitised path as `href`.
- If invalid, the link is not rendered at all — there is no fallback "Back" to a guessed location.

### Anchor fragment (`#section-id`)

Topics may include `## Sub-heading` markdown which the MDX renderer turns into anchored `<h2 id="sub-heading">`. Deep-linking with a fragment scrolls to it on load. No special routing handling needed — this is browser-native.

---

## Status codes

| Scenario | Status | Notes |
|---|---|---|
| Topic exists | 200 | |
| Section exists, topic doesn't | 404 | |
| Section doesn't exist | 404 | |
| Topic was renamed via the redirects table | 308 Permanent Redirect | Cached by the browser; old bookmarks stay live |
| Unauthenticated | 307 → `/sign-in?redirect=…` | Handled by `(main)/layout.tsx`, not by the manual |

---

## Caching

- All manual routes are statically generated at build time via `generateStaticParams`.
- The `?return=…` query string is honoured at render time by the topic page; it does NOT participate in the build-time cache key because every query value would otherwise force a unique build entry.
- Standard Next.js cache headers apply; no overrides needed.

---

## Linking from outside the manual

External / non-app links to manual topics MUST use the canonical URL form (`/help/<section>/<topic>`), without query parameters, so that future redirects-on-rename keep them working. In particular:

- The `HelpButton` writes `?return=…` and is therefore the **only** caller permitted to use the query parameter.
- The weekly digest email, if it ever links into the manual, MUST use the bare canonical URL.

---

## Versioning

URL slugs are stable across release cycles. A topic rename adds a redirect to `src/lib/manual/redirects.ts`; the old URL never returns 404 within the v1 lifecycle. If a topic is permanently removed and no successor exists, the redirect points to `/help` with a `notice=topic-removed` informational query param (handled by the welcome page renderer; the welcome page may render an inline banner saying "That topic has been retired — here is the table of contents instead").

---

## Out of scope for v1

- Authenticated-user-specific URL fragments (`/help#my-progress`).
- Per-league branding on the manual URL (e.g. `/l/<slug>/help`) — the manual is universal; per-league branding would conflict with the source-controlled, single-deployment-of-content model.
- Public, unauthenticated mirror of the manual at a marketing-style URL.
