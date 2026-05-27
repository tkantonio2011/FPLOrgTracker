# Data Model: In-App User Manual

**Phase**: 1 — Design
**Feature**: 003-user-manual
**Date**: 2026-05-18

The manual stores **no runtime state**: no DB tables, no API responses, no cookies, no localStorage beyond an optional "search history" we will not implement in v1. The "data" is the shape of the build-time content and the in-memory shapes the UI consumes.

This file documents those shapes precisely enough that a fresh contributor can produce a topic and a generated manifest entry that the renderer will accept without trial-and-error.

---

## Entities

### Topic

A single article in the manual.

**Stored as**: an MDX file at `src/content/manual/<NN-section>/<NN-topic>.mdx`, where `<NN-section>` and `<NN-topic>` are two-digit ordering prefixes used by the manifest generator and stripped from the URL.

**Frontmatter fields** (validated at build time; build fails with a clear error message on any violation):

| Field | Type | Required | Validation |
|---|---|---|---|
| `title` | string | yes | 1–80 chars, no trailing whitespace |
| `audience` | `"member"` \| `"admin"` \| `"both"` | yes | enum exactly as written |
| `summary` | string | yes | 1–200 chars; used in TOC tooltips and as a search-result snippet |
| `lastUpdated` | string | yes | matches `YYYY-MM-DD`, must parse as a valid date, must not be in the future |
| `slug` | string | no | overrides the default slug (derived from the filename); 1–40 chars, lowercase, kebab-case, must be unique within its section |
| `relatedTopics` | string[] | no | each entry must resolve to another topic's full path; cross-section links allowed |
| `featurePagePath` | string | no | the live-app route this topic documents (e.g. `/l/[leagueSlug]/standings`); used by the `HelpButton` coverage test to confirm bidirectional linkage |

**Derived fields** (computed by the manifest generator):

| Field | Source |
|---|---|
| `path` | `/help/<section-slug>/<topic-slug>` — the canonical URL |
| `sectionPath` | `/help/<section-slug>` |
| `section` | the parent section's `id` (see Section below) |
| `order` | numeric prefix of the filename (e.g. `01-…` → 1) |
| `wordCount` | derived from the MDX body, post-strip; informs estimated reading time |

**Body**:
- Standard MDX. Inline components available to authors:
  - `<AnnotatedImage src="<topic>/<name>.png" caption="…" />` — see Visual entity.
  - `<Callout type="note" | "tip" | "warning">…</Callout>`
  - `<Steps>` and `<Step title="…">…</Step>` for numbered procedures with optional inline images.
  - `<KeyboardShortcut keys={['Cmd', 'K']} />`
- Plain Markdown for everything else; rendered through `@tailwindcss/typography`'s `prose` class with a small set of project-specific overrides (FPL purple for headings, white background, etc.).

**Topic state**: there is no state — Topics are immutable between deploys. A topic is "current" if its file exists in `main` at the time of the build; otherwise it doesn't appear in the manual.

---

### Section

A named grouping of Topics in the table of contents.

**Stored as**: implicit — the directory at `src/content/manual/<NN-section>/`. The manifest generator reads an optional `_section.json` file in that directory for human-readable metadata.

**`_section.json` shape** (all fields optional; sensible defaults if omitted):

```json
{
  "id": "league-admin",
  "title": "League Admin",
  "summary": "Everything you need to administer a league.",
  "primaryAudience": "admin"
}
```

| Field | Type | Default if omitted |
|---|---|---|
| `id` | string | derived from the directory name minus the numeric prefix (`20-league-admin` → `league-admin`) |
| `title` | string | the `id` converted to Title Case with hyphens → spaces |
| `summary` | string | `""` — sections without summaries don't render a description block in the TOC |
| `primaryAudience` | `"member"` \| `"admin"` \| `"both"` | `"both"` |

**Derived fields**:

| Field | Source |
|---|---|
| `order` | numeric prefix of the directory name (e.g. `20-…` → 20) |
| `topics` | the ordered array of Topics in the directory |

**Ordering**: sections are listed in ascending `order`. Within a section, topics are listed in ascending `order`. Ties are broken by filename. (The two-digit prefix convention makes ordering visually obvious in the file tree and prevents `_section.json` becoming a required source of truth for ordering.)

---

### Visual

An image embedded in a Topic.

**Stored as**: a PNG file at `public/manual/img/<topic-slug>/<name>.png`, with a sidecar text file at `public/manual/img/<topic-slug>/<name>.png.alt` containing the canonical alt text.

**Conventions**:
- Source PNG is captured at **2× DPI** (typically 1440px wide for a desktop screenshot, 750–828px wide for a phone shot). Smaller assets are tolerated for diagrams; the lightbox sizes to the natural dimensions.
- Annotations (arrows, highlighted regions, captions inside the image) are baked into the PNG by the author. No SVG overlay.
- The sidecar `.alt` file contains plain text, no markdown. CI fails if a PNG under `public/manual/img/` lacks a sibling `.alt`.
- File names are kebab-case and stable. Renaming is permitted but breaks any topic that references the old name; the build catches this because every `<AnnotatedImage src=…>` validates the path against the filesystem.

**Author-facing component (`AnnotatedImage`) props**:

| Prop | Type | Required | Meaning |
|---|---|---|---|
| `src` | string | yes | `"<topic>/<name>.png"` relative to `public/manual/img/`. Validated at build time. |
| `caption` | string | no | Renders below the image in `text-sm text-slate-500`. Falls back to `null`. |
| `alt` | string | no | Overrides the sidecar `.alt` file. Use sparingly (when the same image is reused with a different framing in another topic). |
| `width` / `height` | number | no | Override the auto-detected dimensions. Default is whatever `next/image` infers from the file. |

---

### ManualManifest

The build-time index that the renderer consumes.

**Stored as**: `src/content/manual/manifest.ts` — generated, committed, linguist-tagged.

**Shape**:

```typescript
export interface ManualManifest {
  generatedAt: string;            // ISO-8601 timestamp of the build
  sections: ManifestSection[];
}

export interface ManifestSection {
  id: string;                     // e.g. "league-admin"
  order: number;                  // e.g. 20
  title: string;
  summary: string;
  primaryAudience: Audience;
  path: string;                   // e.g. "/help/league-admin"
  topics: ManifestTopic[];
}

export interface ManifestTopic {
  slug: string;                   // e.g. "invite-members"
  title: string;
  audience: Audience;
  summary: string;
  lastUpdated: string;            // YYYY-MM-DD
  path: string;                   // e.g. "/help/league-admin/invite-members"
  sectionId: string;
  order: number;
  wordCount: number;
  featurePagePath: string | null;
  relatedTopics: string[];        // resolved to canonical paths
}

export type Audience = "member" | "admin" | "both";
```

**Generation algorithm** (executed by `scripts/build-manual-index.ts`, invoked from `npm run prebuild`):

1. Read every `**/*.mdx` under `src/content/manual/`.
2. For each file, parse frontmatter with `gray-matter`; validate every required field per the rules above; collect `wordCount` from the body after stripping JSX/MDX syntax.
3. Resolve `relatedTopics` to canonical `/help/…` paths; fail on any unresolved reference.
4. Group topics by section directory; load `_section.json` if present.
5. Sort sections and topics by `order`.
6. Emit `manifest.ts` as a single `export const manualManifest: ManualManifest = …` literal.

---

### SearchIndex

The build-time index Fuse consumes.

**Stored as**: `src/content/manual/search-index.json` — generated, committed.

**Shape**:

```typescript
export interface SearchIndexEntry {
  slug: string;                   // matches ManifestTopic.slug
  path: string;                   // canonical URL
  title: string;
  audience: Audience;
  sectionTitle: string;
  summary: string;
  body: string;                   // plain-text extract of the MDX body, JSX stripped
}

export type SearchIndex = SearchIndexEntry[];
```

**Generation**: same script that emits the manifest, executed in the same pass. Body extraction strips JSX tags, collapses whitespace, truncates to 5000 chars per topic (Fuse's relevance falls off well before that; truncating bounds the bundle size).

**Client-side wiring**: `src/lib/manual/search.ts` imports the JSON, instantiates a Fuse instance with weighted keys (`{ name: 'title', weight: 0.5 }`, `{ name: 'summary', weight: 0.3 }`, `{ name: 'body', weight: 0.2 }`), threshold 0.4, and exposes a typed `searchManual(query: string): SearchResult[]` function.

---

### ReturnPath (in-flight)

The `?return=<encoded path>` query parameter the contextual `HelpButton` writes.

**Lifecycle**: written when the user clicks `HelpButton`, read by `TopicView` to render the "Back to <previous page>" affordance, then discarded. Not persisted.

**Validation** (`src/lib/manual/return-path.ts`):

```typescript
export function safeReturnPath(raw: string | null | undefined): string {
  if (!raw) return "/";
  let decoded: string;
  try { decoded = decodeURIComponent(raw); } catch { return "/"; }
  // Must be an in-app relative path. Reject anything that could be parsed as
  // an external URL or a protocol-relative URL.
  if (!decoded.startsWith("/")) return "/";
  if (decoded.startsWith("//")) return "/";
  if (/[\\:]/.test(decoded)) return "/";
  // Reject control characters that could mess with header parsing.
  if (/[\x00-\x1F\x7F]/.test(decoded)) return "/";
  return decoded;
}
```

**Display**: the rendered link text is humanised — `/l/sandsharks/standings` → "Back to Standings". Mapping table lives in `src/lib/manual/return-path.ts` next to the sanitiser; unknown paths fall back to "Back to where you were".

---

## Field-level rules summary

| Constraint | Rule | Enforcement |
|---|---|---|
| Topic slug uniqueness | Unique within section | Build fails |
| `audience` enum | Exactly one of `member` / `admin` / `both` | Build fails |
| `lastUpdated` format | `YYYY-MM-DD`, valid date, not in future | Build fails |
| Alt-text presence | Every PNG under `public/manual/img/` has a sibling `.alt` file | Build fails |
| Referenced image exists | Every `<AnnotatedImage src=…>` resolves to a file | Build fails |
| `relatedTopics` resolution | Every entry resolves to a known topic | Build fails |
| `featurePagePath` coverage (informational) | Every member-facing app page is referenced by exactly one topic | Build warning (informational, not blocking) |
| `HelpButton` coverage (FR-003, SC-005) | Every member-facing app page imports `<HelpButton>` | Test fails (`tests/unit/manual/help-button-coverage.test.ts`) |

---

## What is deliberately not modelled

- **Per-user reading history** — out of scope for v1; would require client storage or a DB column.
- **Per-topic feedback / "Was this helpful?"** — out of scope for v1.
- **Localised topics** — schema has no `locale` field; all topics are English.
- **Search analytics** — no telemetry collected; if added later, this section gains a `SearchEvent` entity.
- **Rich-media (video) topics** — schema has no `videoUrl` field; topics are text + images only.

These are deferral signals, not foreclosures. Each could be added without rewriting existing topics.
