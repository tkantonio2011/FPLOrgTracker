/**
 * SC-005 coverage gate.
 *
 * Every member-facing and admin-facing feature page MUST import `HelpButton`
 * and mount it in the rendered tree. This test reads each page file as text
 * and asserts the import + usage are present. It's deliberately textual
 * (no AST walk) — fast, dependency-free, and the failure message clearly
 * names the missing pages so the fix is mechanical.
 *
 * If you're adding a new feature page under /l/[leagueSlug]/..., add the
 * page path here AND the corresponding HelpButton import + render in the page
 * itself. The build will fail until both sides agree.
 */

import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

const REPO_ROOT = resolve(__dirname, "..", "..", "..");

interface PageSpec {
  /** Path relative to repo root. */
  file: string;
  /** Expected topic prop passed to <HelpButton>. */
  topic: string;
}

const REQUIRED_PAGES: ReadonlyArray<PageSpec> = [
  // Gameweek
  { file: "src/app/(main)/l/[leagueSlug]/standings/page.tsx", topic: "/help/reading-the-app/standings" },
  { file: "src/app/(main)/l/[leagueSlug]/live/page.tsx", topic: "/help/reading-the-app/live-points" },
  { file: "src/app/(main)/l/[leagueSlug]/transfers/page.tsx", topic: "/help/reading-the-app/transfers" },
  // Season
  { file: "src/app/(main)/l/[leagueSlug]/form/page.tsx", topic: "/help/reading-the-app/form-table" },
  { file: "src/app/(main)/l/[leagueSlug]/season-stats/page.tsx", topic: "/help/reading-the-app/season-stats" },
  { file: "src/app/(main)/l/[leagueSlug]/bench/page.tsx", topic: "/help/reading-the-app/bench-waste" },
  { file: "src/app/(main)/l/[leagueSlug]/captain-history/page.tsx", topic: "/help/reading-the-app/captain-history" },
  { file: "src/app/(main)/l/[leagueSlug]/h2h/page.tsx", topic: "/help/reading-the-app/h2h" },
  { file: "src/app/(main)/l/[leagueSlug]/regret/page.tsx", topic: "/help/reading-the-app/regret" },
  { file: "src/app/(main)/l/[leagueSlug]/agony/page.tsx", topic: "/help/reading-the-app/agony" },
  { file: "src/app/(main)/l/[leagueSlug]/luck/page.tsx", topic: "/help/reading-the-app/luck" },
  { file: "src/app/(main)/l/[leagueSlug]/captain-whatif/page.tsx", topic: "/help/reading-the-app/captain-whatif" },
  { file: "src/app/(main)/l/[leagueSlug]/wall-of-shame/page.tsx", topic: "/help/reading-the-app/wall-of-shame" },
  // Scout
  { file: "src/app/(main)/l/[leagueSlug]/ownership/page.tsx", topic: "/help/reading-the-app/ownership" },
  { file: "src/app/(main)/l/[leagueSlug]/differentials/page.tsx", topic: "/help/reading-the-app/differentials" },
  { file: "src/app/(main)/l/[leagueSlug]/player-status/page.tsx", topic: "/help/reading-the-app/injuries" },
  // Admin
  { file: "src/app/(main)/l/[leagueSlug]/admin/settings/page.tsx", topic: "/help/league-admin/league-settings" },
  { file: "src/app/(main)/l/[leagueSlug]/admin/members/page.tsx", topic: "/help/league-admin/inviting-members" },
  { file: "src/app/(main)/l/[leagueSlug]/admin/digest/page.tsx", topic: "/help/league-admin/weekly-digest" },
  { file: "src/app/(main)/l/[leagueSlug]/admin/audit/page.tsx", topic: "/help/league-admin/audit-log" },
  // Cross-league
  { file: "src/app/(main)/my-admin/page.tsx", topic: "/help/league-admin/overview" },
  { file: "src/app/(main)/leagues/page.tsx", topic: "/help/getting-started/switching-leagues" },
];

interface Finding {
  spec: PageSpec;
  hasImport: boolean;
  hasUsage: boolean;
}

function audit(): Finding[] {
  const out: Finding[] = [];
  for (const spec of REQUIRED_PAGES) {
    const full = join(REPO_ROOT, spec.file);
    if (!existsSync(full)) {
      out.push({ spec, hasImport: false, hasUsage: false });
      continue;
    }
    const src = readFileSync(full, "utf-8");
    const hasImport = /from\s+["']@\/components\/manual\/HelpButton["']/.test(src);
    const hasUsage = /<HelpButton\b/.test(src);
    out.push({ spec, hasImport, hasUsage });
  }
  return out;
}

describe("help-button-coverage", () => {
  it("every feature page imports HelpButton AND uses it", () => {
    const findings = audit();
    const missing = findings.filter((f) => !f.hasImport || !f.hasUsage);
    if (missing.length > 0) {
      const lines = missing.map((f) => {
        const parts: string[] = [];
        if (!f.hasImport) parts.push("no import");
        if (!f.hasUsage) parts.push("no <HelpButton> rendered");
        return `  • ${f.spec.file} (topic: ${f.spec.topic}) — ${parts.join(", ")}`;
      });
      throw new Error(
        `[help-button-coverage] ${missing.length} page(s) do not mount <HelpButton>:\n${lines.join("\n")}\n\n` +
          `Add:\n  import { HelpButton } from "@/components/manual/HelpButton";\n` +
          `…and render <HelpButton topic="<TOPIC>" /> next to the page <h1>.`,
      );
    }
    expect(missing.length).toBe(0);
  });
});
