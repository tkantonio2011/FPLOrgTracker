# Contract: `<HelpButton>` Component

**Phase**: 1 — Design / Contracts
**Audience**: Engineers adding feature pages, or modifying existing ones
**Status**: Stable for v1

`<HelpButton>` is the single component that mounts the contextual "?" affordance on every feature page. Its purpose is to make "every page has help" a property the codebase can statically prove, not a discipline that depends on reviewer vigilance.

---

## Surface

```typescript
interface HelpButtonProps {
  /**
   * The canonical manual path for the topic that documents this page.
   * MUST start with `/help/` and MUST resolve to a topic in the manifest at build time.
   */
  topic: string;

  /**
   * Optional accessible label override. Defaults to "Help on this page".
   * Override when the page already has a "help" affordance that needs disambiguation
   * (e.g. an Admin page that also has a "Send digest help" inline link).
   */
  ariaLabel?: string;

  /**
   * Size variant. Defaults to "md".
   * "sm" — for dense headers where space is at a premium (e.g. mobile compact mode).
   */
  size?: "sm" | "md";
}
```

**Import**: `import { HelpButton } from "@/components/manual/HelpButton";`

---

## Rendered behaviour

A circular icon button rendered as a `<Link>` to `${topic}?return=${encodeURIComponent(currentPath)}`. The icon is the same "?" SVG used throughout the existing icon set in `Sidebar.tsx`. Size 24×24 by default (`size="md"`); 18×18 when `size="sm"`.

Hover: background fills with `bg-slate-100`; the icon strokes to `text-slate-700`.
Focus: a `focus-visible` ring matching the rest of the app's focus treatment.
Click / Enter / Space: navigates via `next/link`, no full page reload.

When the manual page renders, it reads the `return` query param via `safeReturnPath` (see `data-model.md` → ReturnPath) and renders a "Back to <pretty name>" link at the top of the topic body.

---

## Placement convention

`HelpButton` MUST be rendered inside the page header, to the right of the page title, on every member-facing and admin-facing feature page. The convention is:

```tsx
<header className="flex items-start justify-between gap-3 mb-6">
  <div>
    <h1 className="text-2xl font-bold">Standings</h1>
    <p className="text-sm text-slate-500">Live ranking, captain, and chip usage…</p>
  </div>
  <HelpButton topic="/help/reading-the-app/standings" />
</header>
```

The exact markup is not part of the contract — only the **import + render** are. The `help-button-coverage` test imports each page module and asserts that `HelpButton` appears in its rendered tree (via a lightweight AST walk, not a render snapshot).

---

## Pages this MUST appear on

The test enforces coverage on every page under:

- `src/app/(main)/l/[leagueSlug]/standings/page.tsx`
- `src/app/(main)/l/[leagueSlug]/live/page.tsx`
- `src/app/(main)/l/[leagueSlug]/transfers/page.tsx`
- `src/app/(main)/l/[leagueSlug]/form/page.tsx`
- `src/app/(main)/l/[leagueSlug]/season-stats/page.tsx`
- `src/app/(main)/l/[leagueSlug]/bench/page.tsx`
- `src/app/(main)/l/[leagueSlug]/captain-history/page.tsx`
- `src/app/(main)/l/[leagueSlug]/h2h/page.tsx`
- `src/app/(main)/l/[leagueSlug]/regret/page.tsx`
- `src/app/(main)/l/[leagueSlug]/agony/page.tsx`
- `src/app/(main)/l/[leagueSlug]/luck/page.tsx`
- `src/app/(main)/l/[leagueSlug]/captain-whatif/page.tsx`
- `src/app/(main)/l/[leagueSlug]/wall-of-shame/page.tsx`
- `src/app/(main)/l/[leagueSlug]/fixtures/page.tsx` *(platform-scoped — see Sidebar.tsx)*
- `src/app/(main)/l/[leagueSlug]/ownership/page.tsx`
- `src/app/(main)/l/[leagueSlug]/differentials/page.tsx`
- `src/app/(main)/l/[leagueSlug]/player-status/page.tsx`
- `src/app/(main)/l/[leagueSlug]/admin/settings/page.tsx`
- `src/app/(main)/l/[leagueSlug]/admin/members/page.tsx`
- `src/app/(main)/l/[leagueSlug]/admin/digest/page.tsx`
- `src/app/(main)/l/[leagueSlug]/admin/audit/page.tsx`
- `src/app/(main)/my-admin/page.tsx`
- `src/app/(main)/leagues/page.tsx`

Pages added under `src/app/(main)/l/[leagueSlug]/…` after this contract lands MUST be appended to the test's coverage list in the same PR that adds them.

---

## Accessibility

- `aria-label` provided either by the explicit `ariaLabel` prop or the default `"Help on this page"`.
- Focusable; appears in tab order between the page header and the first interactive control of the page body.
- Keyboard activation via Enter or Space (free from `<Link>`).
- Reduced-motion media query honoured — hover transition is `transition-colors duration-150`, well under the threshold where animations matter.

---

## What `<HelpButton>` does NOT do

- It does not pre-fetch the manual page (Next.js's `Link` prefetcher does that anyway).
- It does not render an inline popover or tooltip — it navigates. Popovers were considered (R10) and rejected.
- It does not check whether the `topic` exists at runtime. Build-time validation in the manifest generator is the source of truth; an invalid `topic` produces a 404 on click, which is the same failure mode as a typo'd URL anywhere else.

---

## Migration of an existing page

Adding `HelpButton` to an existing page is a three-line change:

```diff
+ import { HelpButton } from "@/components/manual/HelpButton";

  export default function StandingsPage() {
    …
    return (
      <div>
-       <h1>Standings</h1>
+       <header className="flex items-start justify-between gap-3 mb-6">
+         <h1>Standings</h1>
+         <HelpButton topic="/help/reading-the-app/standings" />
+       </header>
        …
      </div>
    );
  }
```

The `help-button-coverage` test then passes for that page. The matching topic must already exist in `src/content/manual/` (or be added in the same PR) or the manifest build fails.
