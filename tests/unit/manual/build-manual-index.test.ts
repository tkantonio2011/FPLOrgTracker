import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execSync } from "node:child_process";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync, readFileSync, cpSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

/**
 * The generator script reads from CWD, so we copy a minimum subset of the
 * repo (the script + its imports) into a scratch directory, lay down content
 * under src/content/manual/, and run the script in that CWD.
 *
 * This validates the script as a black box — end-to-end manifest emission.
 */

const REPO_ROOT = resolve(__dirname, "..", "..", "..");

let scratch: string;

function setupScratchRepo(): void {
  scratch = mkdtempSync(join(tmpdir(), "manual-gen-"));
  // Copy the bits the script reads at runtime — the script + its lib imports.
  // We re-create an `npm` package layout pointing back at the real node_modules
  // via a symlink (faster + smaller than copying node_modules).
  cpSync(join(REPO_ROOT, "scripts", "build-manual-index.ts"), join(scratch, "scripts", "build-manual-index.ts"));
  cpSync(join(REPO_ROOT, "src", "lib", "manual"), join(scratch, "src", "lib", "manual"), { recursive: true });
  cpSync(join(REPO_ROOT, "tsconfig.json"), join(scratch, "tsconfig.json"));
  cpSync(join(REPO_ROOT, "package.json"), join(scratch, "package.json"));
  // Symlink node_modules so tsx + gray-matter are resolvable.
  // Use junction on Windows (symlinkSync with 'junction').
  const { symlinkSync } = require("node:fs");
  symlinkSync(join(REPO_ROOT, "node_modules"), join(scratch, "node_modules"), "junction");
  mkdirSync(join(scratch, "src", "content", "manual"), { recursive: true });
  mkdirSync(join(scratch, "public", "manual", "img"), { recursive: true });
}

function runGenerator(): { stdout: string; stderr: string; code: number } {
  try {
    const stdout = execSync(`npx tsx scripts/build-manual-index.ts`, {
      cwd: scratch,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    return { stdout, stderr: "", code: 0 };
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; status?: number };
    return { stdout: e.stdout ?? "", stderr: e.stderr ?? "", code: e.status ?? 1 };
  }
}

function writeTopic(rel: string, frontmatter: Record<string, unknown>, body = "Hello."): void {
  const full = join(scratch, "src", "content", "manual", rel);
  mkdirSync(join(full, ".."), { recursive: true });
  const yaml =
    "---\n" +
    Object.entries(frontmatter)
      .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
      .join("\n") +
    "\n---\n" +
    body;
  writeFileSync(full, yaml, "utf-8");
}

function writeImage(srcRel: string, alt: string): void {
  // A tiny non-empty file is enough — the generator only checks existence.
  const imgPath = join(scratch, "public", "manual", "img", srcRel);
  mkdirSync(join(imgPath, ".."), { recursive: true });
  writeFileSync(imgPath, "fake-png-bytes", "binary");
  writeFileSync(`${imgPath}.alt`, alt, "utf-8");
}

beforeEach(() => {
  setupScratchRepo();
});

afterEach(() => {
  rmSync(scratch, { recursive: true, force: true });
});

describe("build-manual-index generator — happy path", () => {
  it("emits manifest + search-index + alt-map for valid content", () => {
    writeTopic("00-getting-started/01-welcome.mdx", {
      title: "Welcome",
      audience: "both",
      summary: "Introduction.",
      lastUpdated: "2026-05-18",
    });
    const { code, stdout, stderr } = runGenerator();
    expect(code, `stderr: ${stderr}`).toBe(0);
    expect(stdout).toContain("wrote 1 topics");

    const manifestSource = readFileSync(join(scratch, "src/content/manual/manifest.ts"), "utf-8");
    expect(manifestSource).toContain('"slug": "welcome"');
    expect(manifestSource).toContain('"path": "/help/getting-started/welcome"');

    const searchIndex = JSON.parse(
      readFileSync(join(scratch, "src/content/manual/search-index.json"), "utf-8"),
    );
    expect(searchIndex).toHaveLength(1);
    expect(searchIndex[0].slug).toBe("welcome");
  });

  it("orders sections by their numeric prefix", () => {
    writeTopic("20-league-admin/01-overview.mdx", {
      title: "Admin Overview",
      audience: "admin",
      summary: "x",
      lastUpdated: "2026-05-18",
    });
    writeTopic("00-getting-started/01-welcome.mdx", {
      title: "Welcome",
      audience: "both",
      summary: "y",
      lastUpdated: "2026-05-18",
    });
    runGenerator();
    const manifest = readFileSync(join(scratch, "src/content/manual/manifest.ts"), "utf-8");
    const gettingStartedIdx = manifest.indexOf('"id": "getting-started"');
    const leagueAdminIdx = manifest.indexOf('"id": "league-admin"');
    expect(gettingStartedIdx).toBeGreaterThan(-1);
    expect(leagueAdminIdx).toBeGreaterThan(-1);
    expect(gettingStartedIdx).toBeLessThan(leagueAdminIdx);
  });

  it("validates image references — succeeds when image + alt exist", () => {
    writeImage("welcome/screen.png", "The welcome page after sign-in.");
    writeTopic(
      "00-getting-started/01-welcome.mdx",
      { title: "Welcome", audience: "both", summary: "y", lastUpdated: "2026-05-18" },
      '<AnnotatedImage src="welcome/screen.png" />',
    );
    const { code, stderr } = runGenerator();
    expect(code, `stderr: ${stderr}`).toBe(0);
    const altMap = JSON.parse(readFileSync(join(scratch, "src/content/manual/alt-map.json"), "utf-8"));
    expect(altMap["welcome/screen.png"]).toBe("The welcome page after sign-in.");
  });
});

describe("build-manual-index generator — failures", () => {
  it("fails when an <AnnotatedImage src> references a missing image", () => {
    writeTopic(
      "00-getting-started/01-welcome.mdx",
      { title: "Welcome", audience: "both", summary: "y", lastUpdated: "2026-05-18" },
      '<AnnotatedImage src="missing/file.png" />',
    );
    const { code, stderr } = runGenerator();
    expect(code).not.toBe(0);
    expect(stderr).toContain("does not exist");
  });

  it("fails when an image has no .alt sidecar", () => {
    // Image without sidecar
    const imgPath = join(scratch, "public", "manual", "img", "lonely.png");
    mkdirSync(join(imgPath, ".."), { recursive: true });
    writeFileSync(imgPath, "x", "binary");
    writeTopic(
      "00-getting-started/01-welcome.mdx",
      { title: "Welcome", audience: "both", summary: "y", lastUpdated: "2026-05-18" },
      '<AnnotatedImage src="lonely.png" />',
    );
    const { code, stderr } = runGenerator();
    expect(code).not.toBe(0);
    expect(stderr).toContain("sibling .alt");
  });

  it("fails when relatedTopics references an unknown path", () => {
    writeTopic("00-getting-started/01-welcome.mdx", {
      title: "Welcome",
      audience: "both",
      summary: "y",
      lastUpdated: "2026-05-18",
      relatedTopics: ["/help/nope/missing"],
    });
    const { code, stderr } = runGenerator();
    expect(code).not.toBe(0);
    expect(stderr).toContain("does not resolve");
  });

  it("fails on invalid frontmatter (missing audience)", () => {
    writeTopic("00-getting-started/01-welcome.mdx", {
      title: "Welcome",
      summary: "y",
      lastUpdated: "2026-05-18",
    });
    const { code, stderr } = runGenerator();
    expect(code).not.toBe(0);
    expect(stderr).toContain("audience");
  });
});

describe("build-manual-index generator — empty content", () => {
  it("emits empty manifest + index when no topics exist", () => {
    const { code } = runGenerator();
    expect(code).toBe(0);
    const manifest = readFileSync(join(scratch, "src/content/manual/manifest.ts"), "utf-8");
    expect(manifest).toContain('"sections": []');
    const searchIndex = JSON.parse(readFileSync(join(scratch, "src/content/manual/search-index.json"), "utf-8"));
    expect(searchIndex).toEqual([]);
  });
});
