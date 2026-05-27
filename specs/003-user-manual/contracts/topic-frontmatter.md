# Contract: Topic Frontmatter

**Phase**: 1 — Design / Contracts
**Audience**: Content authors and reviewers
**Status**: Stable for v1

Every MDX file under `src/content/manual/` must begin with a YAML frontmatter block conforming to this contract. The build validates every field and fails — loudly — on any violation. There is no silent fallback.

---

## Required block

```yaml
---
title: Inviting a member by email
audience: admin
summary: Send a single-use magic-link to a new member and have them land in the league as soon as they accept.
lastUpdated: 2026-05-18
---
```

## Optional fields

```yaml
---
title: Inviting a member by email
audience: admin
summary: …
lastUpdated: 2026-05-18

# Optional from here down.
slug: invite-members                       # default = filename minus the numeric prefix
featurePagePath: /l/[leagueSlug]/admin/members
relatedTopics:
  - /help/league-admin/editing-members
  - /help/league-admin/audit-log
---
```

---

## Field reference

| Field | Type | Required | Constraint | What happens if you violate it |
|---|---|---|---|---|
| `title` | string | yes | 1–80 chars; no trailing whitespace; sentence case preferred | Build error: `[manifest] <path>: title must be 1–80 non-blank chars` |
| `audience` | enum | yes | `member` \| `admin` \| `both` | Build error: `[manifest] <path>: audience must be one of "member","admin","both"` |
| `summary` | string | yes | 1–200 chars; one sentence, no markdown | Build error: `[manifest] <path>: summary must be 1–200 chars` |
| `lastUpdated` | string | yes | `YYYY-MM-DD`; parses as a valid `Date`; not in the future relative to build time | Build error: `[manifest] <path>: lastUpdated must be YYYY-MM-DD and not in the future` |
| `slug` | string | no | 1–40 chars, lowercase kebab-case (`^[a-z][a-z0-9-]{0,39}$`); unique within section | Build error: `[manifest] <path>: slug "<value>" collides with <other path>` |
| `featurePagePath` | string | no | A live-app route. Used by the `HelpButton` coverage test (`tests/unit/manual/help-button-coverage.test.ts`). | Test failure: `[help-button-coverage] page <featurePagePath> does not import HelpButton` |
| `relatedTopics` | string[] | no | Each entry resolves to a `/help/...` path that maps to a known topic | Build error: `[manifest] <path>: relatedTopic "<value>" does not resolve` |

Unknown fields are tolerated (the parser ignores them) so authors can experiment with metadata that doesn't yet have renderer support without breaking the build.

---

## Examples

### Member topic

```yaml
---
title: Reading the Standings page
audience: member
summary: How the leaderboard is ordered, what the rank-change arrows mean, and how the relegation zone is calculated.
lastUpdated: 2026-05-18
featurePagePath: /l/[leagueSlug]/standings
relatedTopics:
  - /help/reading-the-app/form-table
  - /help/reading-the-app/live-points
---
```

### Admin topic

```yaml
---
title: Sending the weekly digest
audience: admin
summary: Trigger a GW-summary email to every member with a configured address, what each section of the email contains, and how to customise the AI tone.
lastUpdated: 2026-05-18
featurePagePath: /l/[leagueSlug]/admin/digest
relatedTopics:
  - /help/league-admin/editing-members
---
```

### Cross-audience topic (Getting Started)

```yaml
---
title: Signing in with a magic-link
audience: both
summary: How the email-based sign-in works, how long links live, and what to do if your email never arrives.
lastUpdated: 2026-05-18
---
```

---

## What MUST appear in the body

After the frontmatter the body is MDX. Every topic body MUST:

1. **Open with an intro paragraph** — no heading immediately after frontmatter. The page renderer composes a heading from `title`; an `# H1` in the body produces a duplicated title.
2. **Include at least one `<AnnotatedImage>`** for any topic with `featurePagePath`. Topics in `00-getting-started/` that describe abstract concepts (e.g. magic-link mechanics) may skip this if a diagram would not aid comprehension; the reviewer is the judge.
3. **Use `<Callout type="warning">…</Callout>`** for destructive or hard-to-undo actions (suspending a league, removing a member, regenerating a digest).
4. **End without a trailing "next steps" boilerplate** — the renderer composes a "Related topics" footer from frontmatter.

---

## Renaming a topic

To rename:

1. Update the filename or the directory containing the topic. The new slug propagates through the build-time manifest.
2. **Add a redirect** in `src/lib/manual/redirects.ts` from the old path to the new — old bookmarks and shared links keep working. (Redirects are a flat `Record<string, string>`; no separate contract file.)
3. Update every `<HelpButton topic="<old>">` on feature pages to point at the new slug. The `help-button-coverage` test will fail if you miss one.
4. Bump `lastUpdated` on the renamed topic if the rename reflects a content change; leave it untouched if it's purely an organisational move.

---

## Removing a topic

1. Delete the MDX file and its image directory under `public/manual/img/<slug>/`.
2. Add a redirect entry pointing the old path to the most-relevant surviving topic, or to `/help` if no good substitute exists.
3. Remove the topic from any `relatedTopics` lists that reference it (build will fail if you skip this).

A removed topic should also be removed from any `featurePagePath` page's `HelpButton` — replace with the nearest surviving topic, or remove the help button entirely if the feature page itself is going away.
