# Quickstart: In-App User Manual

**Phase**: 1 — Design / Operator-Author Guide
**Branch**: `003-user-manual`
**Date**: 2026-05-18

This document is the practical guide for the two people who will actually live with this feature: the engineer wiring it up, and the content author who will write topics afterwards. Each section is procedural — copy the commands, follow the steps.

---

## 1. One-time dev setup

Add the new dependencies:

```powershell
npm install @next/mdx @mdx-js/loader @mdx-js/react @tailwindcss/typography gray-matter fuse.js
npm install --save-dev @types/mdx
```

Enable MDX in `next.config.mjs`:

```js
import nextMDX from "@next/mdx";

const withMDX = nextMDX({
  extension: /\.mdx?$/,
  options: { remarkPlugins: [], rehypePlugins: [] },
});

const nextConfig = {
  // ...existing config...
  pageExtensions: ["ts", "tsx", "js", "jsx", "mdx"],
};

export default withMDX(nextConfig);
```

Enable typography in `tailwind.config.ts`:

```ts
import typography from "@tailwindcss/typography";

const config: Config = {
  // ...
  plugins: [typography],
};
```

Add the `prebuild` script to `package.json`:

```json
{
  "scripts": {
    "prebuild": "tsx scripts/build-manual-index.ts",
    "build": "next build"
  }
}
```

The first `npm run dev` after this will scan `src/content/manual/`, generate the manifest + search index, then start the dev server. MDX hot-reload works for both prose and embedded components.

---

## 2. Wiring the sidebar entry (engineer, one-line change)

In `src/components/layout/Sidebar.tsx`, add to the final `navGroups` entry (the one that currently holds just the per-league "Admin" item):

```tsx
{
  items: [
    { path: "/help", label: "Help", icon: <HelpIcon />, platform: true },
    { path: "/admin", label: "Admin", icon: <SettingsIcon /> },
  ],
},
```

`HelpIcon` is a new inline SVG — copy the pattern from the existing `SettingsIcon`. `platform: true` ensures the league-slug prefix is not applied (the manual is universal, not league-scoped).

---

## 3. Adding `HelpButton` to feature pages (engineer, ~22 PRs or one bulk PR)

For every page listed in [`contracts/help-button.md`](contracts/help-button.md#pages-this-must-appear-on):

```diff
+ import { HelpButton } from "@/components/manual/HelpButton";

  export default function StandingsPage() {
    return (
      <div>
-       <h1 className="text-2xl font-bold">Standings</h1>
+       <header className="flex items-start justify-between gap-3 mb-6">
+         <h1 className="text-2xl font-bold">Standings</h1>
+         <HelpButton topic="/help/reading-the-app/standings" />
+       </header>
        {/* …existing page body… */}
```

The matching topic must exist (or be added in the same PR) or `npm run build` fails. The `help-button-coverage` test will fail at CI time if a page is missed.

---

## 4. Adding a topic (content author, the common case)

### 4a. Create the MDX file

```powershell
$section = "20-league-admin"
$slug = "09-bulk-import-members"   # use a 2-digit prefix for ordering

New-Item -ItemType Directory -Force -Path "src/content/manual/$section/" | Out-Null
$path = "src/content/manual/$section/$slug.mdx"
```

```mdx
---
title: Bulk-importing members from a CSV
audience: admin
summary: Upload a CSV of email addresses to invite many members at once instead of clicking "Invite" for each row.
lastUpdated: 2026-05-18
featurePagePath: /l/[leagueSlug]/admin/members
relatedTopics:
  - /help/league-admin/inviting-members
---

Bulk import is the fastest way to onboard a league with more than ten members.
The CSV must have a single column of email addresses, no header row, and at most 200 rows per upload.

<Callout type="warning">
  Every email in the CSV that doesn't already have a UserAccount on the platform will receive
  an invitation email immediately on upload. Double-check the list before clicking Confirm.
</Callout>

<Steps>
  <Step title="Open the Members admin page">
    From your league's sidebar, choose <strong>Admin → Members</strong>.

    <AnnotatedImage
      src="bulk-import-members/admin-members.png"
      caption="The Admin → Members page with the Bulk Import button highlighted."
    />
  </Step>

  <Step title="Choose the CSV file">
    Click <strong>Bulk Import</strong>. Pick the CSV from your computer. The preview shows the first ten rows so you can sanity-check.
  </Step>

  <Step title="Confirm">
    Click <strong>Send invitations</strong>. The screen shows progress and any rows that were rejected (invalid email format, already a member, etc.).
  </Step>
</Steps>
```

### 4b. Add the screenshot

```powershell
$imgDir = "public/manual/img/bulk-import-members"
New-Item -ItemType Directory -Force -Path $imgDir | Out-Null

# Drop your screenshot here:
#   public/manual/img/bulk-import-members/admin-members.png

# Then write the alt-text sidecar:
@'
The Members admin page. The "Bulk Import" button sits next to the existing "Invite" button at the top right of the members table.
'@ | Set-Content -Encoding utf8 "$imgDir/admin-members.png.alt"
```

### 4c. Build to verify

```powershell
npm run build
```

The build will:
- Validate your frontmatter
- Regenerate `src/content/manual/manifest.ts` and `search-index.json`
- Fail loudly if the screenshot path doesn't resolve or the alt-text sidecar is missing
- Statically pre-render the topic page at `/help/league-admin/bulk-import-members`

`npm run dev` does the same incrementally on save.

---

## 5. Updating a screenshot (content author)

A release shipped a UI change that you can see in the Members page. Update the matching screenshot:

```powershell
# Replace the file in-place:
#   public/manual/img/bulk-import-members/admin-members.png  ← new screenshot

# Bump lastUpdated in the topic frontmatter:
notepad src/content/manual/20-league-admin/09-bulk-import-members.mdx
# (change `lastUpdated: 2026-05-18` to today's date)
```

If the screenshot's framing changed enough that the prose no longer matches, edit the prose in the same PR. The "Last updated" timestamp on the rendered topic now reflects the change so readers know they're looking at current content.

---

## 6. Renaming a topic (content author + engineer)

1. Rename the MDX file (e.g. `09-bulk-import-members.mdx` → `09-import-members.mdx`).
2. Add the redirect:
   ```ts
   // src/lib/manual/redirects.ts
   export const manualRedirects: Record<string, string> = {
     "/help/league-admin/bulk-import-members": "/help/league-admin/import-members",
   };
   ```
3. Update every `HelpButton` reference to use the new slug. The `help-button-coverage` test catches misses.
4. Run `npm run build` — fails if you broke a `relatedTopics` reference.

---

## 7. Verifying the manual end-to-end

After landing the wiring + a starter topic set:

```powershell
npm run dev
# Open http://localhost:3000

# 1. Sign in via the magic-link flow.
# 2. Confirm the "Help" entry appears in the sidebar on every page (in and out of a league shell).
# 3. Click Help → land on /help → see the section grid.
# 4. Click "Reading the App" → see the section overview.
# 5. Click "Standings" → see the topic with at least one screenshot.
# 6. Click "Back" in the browser → return to /help.
# 7. Navigate to /l/<slug>/standings → click the "?" button next to the page title →
#    /help/reading-the-app/standings?return=%2Fl%2F<slug>%2Fstandings opens with a
#    "Back to Standings" link at the top.
# 8. Click the search field, type "deduction" → relevant topic appears in <100ms.
# 9. Press Cmd+K (Ctrl+K on Windows) from any manual page → search focuses.
# 10. Open DevTools, throttle to 3G → topic still loads in <2s.
```

Then run the test suite:

```powershell
npm test                 # unit tests
npm run test:e2e         # manual.spec.ts in a real browser
```

---

## 8. Operating in production

The manual is part of the standard Next.js standalone build (`scripts/deploy.sh --skip-build`). No new env vars, no new server-side state, no new database tables. The manual ships with the build and is served as static HTML behind the existing Nginx.

Updating content in production is the same as updating any other code:

1. Author the topic on a branch.
2. Add the screenshots.
3. Open a PR.
4. Merge → CI runs the build (which regenerates the manifest, validates frontmatter, runs the help-button-coverage test, runs E2E).
5. `bash scripts/deploy.sh --skip-build` (or your standard release flow) pushes the updated content.

There is no "publish" step distinct from "deploy", deliberately — that's the source-controlled-content trade-off.

---

## 9. Common failure modes

| Symptom | Likely cause | Fix |
|---|---|---|
| `[manifest] <path>: lastUpdated must be YYYY-MM-DD and not in the future` | You wrote `2026-13-01` or a date past today | Correct the frontmatter date |
| `[manifest] <path>: relatedTopic "/help/foo/bar" does not resolve` | Linked to a slug that doesn't exist or was renamed without a redirect | Either fix the link or add a redirect |
| `[manifest] image <topic>/<name>.png referenced by <mdx> but does not exist` | You added `<AnnotatedImage src=…>` before placing the PNG | Add the PNG (and `.alt` sidecar) under `public/manual/img/<topic>/` |
| `[manifest] image <…> lacks a sibling .alt file` | Forgot the sidecar | Write the alt text to `<name>.png.alt` |
| `[help-button-coverage] page <…> does not import HelpButton` | Added a new feature page without the contextual help affordance | Add `<HelpButton topic="…" />` to the page header |
| Topic renders but search doesn't find it | Search index wasn't regenerated — happens if you bypass `prebuild` | `npm run prebuild` then refresh |
| `/help/<old-slug>` 404s after a rename | Forgot the redirect | Add an entry to `src/lib/manual/redirects.ts` |

---

## 10. What this manual is and isn't

It **is** a comprehensive, source-controlled, in-app reference for Members and League Admins, illustrated with annotated screenshots, deep-linkable from every feature page, and searchable from anywhere inside it.

It **is not** a marketing site, a wiki, a CMS-backed editorial product, or a Super Admin operations manual. Those are deferred to future work; the architecture leaves room for each of them without rewriting the topics that exist today.
