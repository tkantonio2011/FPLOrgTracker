/**
 * One-shot codemod that wires `<HelpButton topic="..." />` into every
 * feature page in the coverage list (specs/003-user-manual/contracts/help-button.md).
 *
 * Idempotent: skips files that already import and render HelpButton.
 *
 * Insertion rules:
 *   - Import: appended after the last `import ... from "@/...";` line.
 *   - Render: inserted on a new line immediately after the matching
 *     `<h1 className="text-2xl font-bold text-slate-900">…</h1>` closing tag.
 *     This places the button next to the page title in the existing flex
 *     container that wraps it in every feature page.
 *
 * Run via: `npx tsx scripts/wire-help-buttons.ts`
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

interface PageWiring {
  file: string;
  topic: string;
}

const PAGES: PageWiring[] = [
  // Gameweek
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
  { file: "src/app/(main)/l/[leagueSlug]/admin/members/page.tsx", topic: "/help/league-admin/inviting-members" },
  { file: "src/app/(main)/l/[leagueSlug]/admin/digest/page.tsx", topic: "/help/league-admin/weekly-digest" },
  { file: "src/app/(main)/l/[leagueSlug]/admin/audit/page.tsx", topic: "/help/league-admin/audit-log" },
  // Cross-league
  { file: "src/app/(main)/my-admin/page.tsx", topic: "/help/league-admin/overview" },
];

const IMPORT_LINE = `import { HelpButton } from "@/components/manual/HelpButton";`;
const H1_RE = /<h1\s+className="text-2xl font-bold text-slate-900"[^>]*>([^<]+)<\/h1>/;

function addImport(source: string): string {
  if (source.includes(IMPORT_LINE)) return source;
  // Insert after the last @/components/ or @/lib/ import.
  const importLineRe = /^import\s+.*\s+from\s+["']@\/[^"']+["'];?\s*$/gm;
  let lastMatch: RegExpExecArray | null = null;
  let m: RegExpExecArray | null;
  while ((m = importLineRe.exec(source)) !== null) {
    lastMatch = m;
  }
  if (!lastMatch) {
    // Fallback: insert after the first import statement.
    const firstImport = source.match(/^import .*;?$/m);
    if (!firstImport) {
      throw new Error("no imports found in file");
    }
    const idx = source.indexOf(firstImport[0]) + firstImport[0].length;
    return source.slice(0, idx) + "\n" + IMPORT_LINE + source.slice(idx);
  }
  const insertAt = lastMatch.index + lastMatch[0].length;
  return source.slice(0, insertAt) + "\n" + IMPORT_LINE + source.slice(insertAt);
}

function addHelpButton(source: string, topic: string): string {
  if (/<HelpButton\b/.test(source)) return source;
  const m = source.match(H1_RE);
  if (!m) {
    throw new Error("no <h1 className=\"text-2xl font-bold text-slate-900\"> found");
  }
  const matchStart = source.indexOf(m[0]);
  const matchEnd = matchStart + m[0].length;
  // Detect existing leading whitespace on the h1 line to keep indentation.
  const lineStart = source.lastIndexOf("\n", matchStart) + 1;
  const indent = source.slice(lineStart, matchStart);
  const insertion = `\n${indent}<HelpButton topic="${topic}" />`;
  return source.slice(0, matchEnd) + insertion + source.slice(matchEnd);
}

function main(): void {
  let modified = 0;
  let skipped = 0;
  let failed = 0;
  const cwd = process.cwd();
  for (const p of PAGES) {
    const full = join(cwd, p.file);
    if (!existsSync(full)) {
      console.error(`  ✗ ${p.file}: file does not exist`);
      failed++;
      continue;
    }
    const original = readFileSync(full, "utf-8");
    if (/<HelpButton\b/.test(original) && original.includes(IMPORT_LINE)) {
      skipped++;
      continue;
    }
    try {
      let next = addImport(original);
      next = addHelpButton(next, p.topic);
      if (next === original) {
        skipped++;
        continue;
      }
      writeFileSync(full, next, "utf-8");
      console.log(`  ✓ ${p.file}`);
      modified++;
    } catch (err) {
      console.error(`  ✗ ${p.file}: ${(err as Error).message}`);
      failed++;
    }
  }
  console.log(
    `\n[wire-help-buttons] modified ${modified}, skipped ${skipped}, failed ${failed}.`,
  );
  if (failed > 0) {
    process.exit(1);
  }
}

main();
