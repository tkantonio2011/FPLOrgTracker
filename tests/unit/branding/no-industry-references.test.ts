/**
 * Automated branding scan — the SC-004 verifier.
 *
 * The platform is multi-tenant and must not bake the original deployment's
 * industry into the codebase. This test recursively walks `src/` and fails
 * if any forbidden token appears in source, style, or doc files.
 *
 * Forbidden tokens (case-insensitive):
 *   - "energy trading"
 *   - "EnergyOne"
 *   - "energy-trading" / "energy.trading" (any separator)
 *
 * Out of scope (intentionally NOT scanned):
 *   - `tests/`     — these tests reference forbidden strings as test fixtures.
 *   - `specs/`     — the spec docs describe the rebranding history.
 *   - `CHANGELOG.md` — past-tense historical entries are allowed to stay.
 *   - `node_modules/`
 *
 * Per-league industry references are allowed at runtime via `League.name`
 * and the per-league `digestPrompt` override — this scan only catches
 * hard-coded ones.
 */

import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const SRC_ROOT = join(__dirname, "..", "..", "..", "src");
const SCAN_EXTENSIONS = new Set([".ts", ".tsx", ".css", ".md"]);

// Each pattern is a RegExp with the `gi` flags. `\W` matches the
// "energy.trading" / "energy-trading" / "energy_trading" variants.
const FORBIDDEN: { name: string; pattern: RegExp }[] = [
  { name: "energy trading", pattern: /energy\s+trading/gi },
  { name: "energy-trading (any separator)", pattern: /energy[^a-z0-9]trading/gi },
  { name: "EnergyOne", pattern: /energyone/gi },
];

function listFilesRecursively(dir: string, acc: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return acc;
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      listFilesRecursively(full, acc);
    } else {
      const dot = entry.lastIndexOf(".");
      const ext = dot >= 0 ? entry.slice(dot).toLowerCase() : "";
      if (SCAN_EXTENSIONS.has(ext)) acc.push(full);
    }
  }
  return acc;
}

interface Hit {
  file: string;
  line: number;
  column: number;
  match: string;
  patternName: string;
}

function scanFile(filePath: string): Hit[] {
  const text = readFileSync(filePath, "utf8");
  const hits: Hit[] = [];
  for (const { name: patternName, pattern } of FORBIDDEN) {
    pattern.lastIndex = 0; // reset across files
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(text)) !== null) {
      // Compute line/column from match index.
      const upto = text.slice(0, m.index);
      const line = (upto.match(/\n/g)?.length ?? 0) + 1;
      const lastNl = upto.lastIndexOf("\n");
      const column = m.index - (lastNl + 1) + 1;
      hits.push({
        file: relative(SRC_ROOT, filePath).split(sep).join("/"),
        line,
        column,
        match: m[0],
        patternName,
      });
      // Defensive: zero-length matches would loop forever (none of our
      // patterns have that property, but belt-and-braces).
      if (m[0].length === 0) pattern.lastIndex++;
    }
  }
  return hits;
}

describe("branding scan (SC-004 verifier)", () => {
  it("src/ contains no forbidden industry references", () => {
    const files = listFilesRecursively(SRC_ROOT);
    // Defensive — if src/ has somehow gone empty, the test would silently pass.
    expect(files.length).toBeGreaterThan(0);

    const allHits: Hit[] = [];
    for (const file of files) {
      allHits.push(...scanFile(file));
    }

    if (allHits.length > 0) {
      const report = allHits
        .map(
          (h) =>
            `  ${h.file}:${h.line}:${h.column}  "${h.match}"  (pattern: ${h.patternName})`,
        )
        .join("\n");
      throw new Error(
        `Found ${allHits.length} forbidden branding reference${allHits.length === 1 ? "" : "s"} under src/:\n${report}\n\nUse League.name or lib/branding/strings.ts instead.`,
      );
    }

    expect(allHits).toEqual([]);
  });
});
