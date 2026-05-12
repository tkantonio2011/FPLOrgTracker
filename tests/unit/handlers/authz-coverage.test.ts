/**
 * Structural authorisation-coverage check (T097).
 *
 * Every route handler under `src/app/api/leagues/[leagueId]/...` MUST
 * call one of the league-scoped require* helpers (`requireLeagueMember`
 * or `requireLeagueAdmin`). Every route handler under
 * `src/app/api/platform/...` MUST call `requireSuperAdmin`.
 *
 * This is the structural enforcement of the rule documented in
 * `research.md` Topic 2 mitigation 1: "Every league-scoped route handler
 * MUST import and call requireLeagueMember or requireLeagueAdmin."
 *
 * It catches the regression where a developer adds a new endpoint and
 * forgets the authz gate — the failure surfaces here at test time, not at
 * the moment an unauthenticated request leaks data.
 *
 * Notes:
 *   - We require BOTH an `import` of the helper AND a callsite. An
 *     unused import (eslint-noise) wouldn't actually gate the handler.
 *   - The check is text-based, not AST-based — false positives are
 *     possible if the helper name appears in a comment or string. The
 *     trade-off is acceptable at v1: this test runs alongside `tsc`
 *     which already validates real usage; the text scan only adds the
 *     "must be present" guarantee.
 *   - Routes under `/api/auth/`, `/api/invitations/`, `/api/players/`,
 *     `/api/fixtures/` (and legacy `/api/org/*`, `/api/admin/*`,
 *     `/api/members/*` during transition) are out of scope — they use
 *     their own gates (`requireSession`, `requireAnySession`, or
 *     deliberate public access).
 */

import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const REPO_SRC = join(__dirname, "..", "..", "..", "src");
const LEAGUE_SCOPE_DIR = join(REPO_SRC, "app", "api", "leagues", "[leagueId]");
const PLATFORM_SCOPE_DIR = join(REPO_SRC, "app", "api", "platform");

const LEAGUE_SCOPE_HELPERS = ["requireLeagueMember", "requireLeagueAdmin"] as const;
const PLATFORM_SCOPE_HELPERS = ["requireSuperAdmin"] as const;

function findRouteFiles(root: string): string[] {
  const acc: string[] = [];
  function walk(dir: string) {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(dir, entry);
      let st;
      try {
        st = statSync(full);
      } catch {
        continue;
      }
      if (st.isDirectory()) walk(full);
      else if (entry === "route.ts" || entry === "route.tsx") acc.push(full);
    }
  }
  walk(root);
  return acc;
}

function fileUsesHelper(text: string, helper: string): { imported: boolean; called: boolean } {
  // Imported: appears in any `import { ... }` line that pulls from a path
  // ending in `/league-scope` or `/platform-scope`.
  const importLineRe = new RegExp(
    `^import\\s*\\{[^}]*\\b${helper}\\b[^}]*\\}\\s*from\\s*["'][^"']*(?:league-scope|platform-scope)["']`,
    "m",
  );
  const imported = importLineRe.test(text);
  // Called: appears as `helper(` anywhere.
  const calledRe = new RegExp(`\\b${helper}\\s*\\(`);
  const called = calledRe.test(text);
  return { imported, called };
}

describe("authz-coverage (T097)", () => {
  it("every league-scoped route imports AND calls requireLeagueMember or requireLeagueAdmin", () => {
    const files = findRouteFiles(LEAGUE_SCOPE_DIR);
    expect(files.length).toBeGreaterThan(0); // sanity — we know there are 30+

    const violations: { file: string; reason: string }[] = [];
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      const rel = relative(REPO_SRC, file).split(sep).join("/");
      const hits = LEAGUE_SCOPE_HELPERS.map((h) => ({ helper: h, ...fileUsesHelper(text, h) }));
      const passing = hits.some((h) => h.imported && h.called);
      if (!passing) {
        const detail = hits
          .map((h) => `${h.helper}: imported=${h.imported} called=${h.called}`)
          .join("; ");
        violations.push({ file: rel, reason: detail });
      }
    }

    if (violations.length > 0) {
      const report = violations.map((v) => `  ${v.file}  →  ${v.reason}`).join("\n");
      throw new Error(
        `Found ${violations.length} league-scoped route handler${violations.length === 1 ? "" : "s"} without a requireLeagueMember/requireLeagueAdmin gate:\n${report}\n\nEvery /api/leagues/[leagueId]/... route MUST start with one of these helpers.`,
      );
    }
    expect(violations).toEqual([]);
  });

  it("every platform-scoped route imports AND calls requireSuperAdmin", () => {
    const files = findRouteFiles(PLATFORM_SCOPE_DIR);
    expect(files.length).toBeGreaterThan(0); // sanity — we know there are 10+

    const violations: { file: string; reason: string }[] = [];
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      const rel = relative(REPO_SRC, file).split(sep).join("/");
      const hits = PLATFORM_SCOPE_HELPERS.map((h) => ({ helper: h, ...fileUsesHelper(text, h) }));
      const passing = hits.some((h) => h.imported && h.called);
      if (!passing) {
        const detail = hits
          .map((h) => `${h.helper}: imported=${h.imported} called=${h.called}`)
          .join("; ");
        violations.push({ file: rel, reason: detail });
      }
    }

    if (violations.length > 0) {
      const report = violations.map((v) => `  ${v.file}  →  ${v.reason}`).join("\n");
      throw new Error(
        `Found ${violations.length} platform-scoped route handler${violations.length === 1 ? "" : "s"} without a requireSuperAdmin gate:\n${report}\n\nEvery /api/platform/... route MUST start with requireSuperAdmin.`,
      );
    }
    expect(violations).toEqual([]);
  });
});
