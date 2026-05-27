/**
 * Build-time topic loader for the in-app user manual (003-user-manual).
 *
 * Walks `src/content/manual/**\/*.mdx`, parses frontmatter with `gray-matter`,
 * validates every required field per `contracts/topic-frontmatter.md`, and
 * returns a typed `LoadedTopic[]`. Throws on the first violation with a
 * `[manifest] <path>: <reason>` message.
 *
 * Pure build-time code — never imported at runtime.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, basename, dirname } from "node:path";
import matter from "gray-matter";
import type { Audience } from "./types";

const SLUG_RE = /^[a-z][a-z0-9-]{0,39}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const VALID_AUDIENCES: ReadonlySet<Audience> = new Set<Audience>(["member", "admin", "both"]);

export interface LoadedTopic {
  /** Absolute path to the .mdx file. */
  absPath: string;
  /** Repo-relative path used in error messages, e.g. "src/content/manual/00-getting-started/01-welcome.mdx". */
  relPath: string;
  /** Section directory name including the numeric prefix, e.g. "00-getting-started". */
  sectionDir: string;
  /** Section id derived from the directory (numeric prefix stripped). */
  sectionId: string;
  /** Section order (the numeric prefix on the directory). */
  sectionOrder: number;
  /** Topic slug (frontmatter override OR derived from filename). */
  slug: string;
  /** Topic order (the numeric prefix on the filename). */
  order: number;
  /** Validated frontmatter. */
  frontmatter: TopicFrontmatter;
  /** The MDX body (post-frontmatter), useful for the search-index extractor. */
  body: string;
}

export interface TopicFrontmatter {
  title: string;
  audience: Audience;
  summary: string;
  lastUpdated: string;
  slug?: string;
  featurePagePath?: string;
  relatedTopics?: string[];
}

class ManifestError extends Error {
  constructor(relPath: string, reason: string) {
    super(`[manifest] ${relPath}: ${reason}`);
    this.name = "ManifestError";
  }
}

/** Recursively list every .mdx file under `root`. */
function walkMdx(root: string): string[] {
  const out: string[] = [];
  if (!safeIsDir(root)) return out;
  for (const entry of readdirSync(root)) {
    const full = join(root, entry);
    if (safeIsDir(full)) {
      out.push(...walkMdx(full));
    } else if (entry.endsWith(".mdx")) {
      out.push(full);
    }
  }
  return out.sort();
}

function safeIsDir(p: string): boolean {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

/** Parse `01-welcome.mdx` → `{ order: 1, slug: "welcome" }`. */
function parseFilenamePrefix(filename: string): { order: number; slug: string } {
  const base = filename.replace(/\.mdx$/, "");
  const match = base.match(/^(\d+)-(.+)$/);
  if (!match) {
    return { order: 9999, slug: base };
  }
  return { order: Number.parseInt(match[1]!, 10), slug: match[2]! };
}

/** Parse `00-getting-started` → `{ order: 0, id: "getting-started" }`. */
function parseDirectoryPrefix(dirName: string): { order: number; id: string } {
  const match = dirName.match(/^(\d+)-(.+)$/);
  if (!match) {
    return { order: 9999, id: dirName };
  }
  return { order: Number.parseInt(match[1]!, 10), id: match[2]! };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateFrontmatter(relPath: string, raw: unknown, todayISO: string): TopicFrontmatter {
  if (!isPlainObject(raw)) {
    throw new ManifestError(relPath, "frontmatter must be a YAML object");
  }

  const title = raw.title;
  if (typeof title !== "string" || title.trim().length === 0 || title.length > 80) {
    throw new ManifestError(relPath, "title must be 1–80 non-blank chars");
  }
  if (title !== title.trimEnd()) {
    throw new ManifestError(relPath, "title must not have trailing whitespace");
  }

  const audience = raw.audience;
  if (typeof audience !== "string" || !VALID_AUDIENCES.has(audience as Audience)) {
    throw new ManifestError(relPath, 'audience must be one of "member","admin","both"');
  }

  const summary = raw.summary;
  if (typeof summary !== "string" || summary.length === 0 || summary.length > 200) {
    throw new ManifestError(relPath, "summary must be 1–200 chars");
  }

  // YAML auto-parses unquoted YYYY-MM-DD as a Date object. Accept either a
  // string in the canonical format OR a Date that we coerce back to ISO date.
  let lastUpdated = raw.lastUpdated;
  if (lastUpdated instanceof Date) {
    if (Number.isNaN(lastUpdated.getTime())) {
      throw new ManifestError(relPath, "lastUpdated must be a valid date");
    }
    lastUpdated = lastUpdated.toISOString().slice(0, 10);
  }
  if (typeof lastUpdated !== "string" || !DATE_RE.test(lastUpdated)) {
    throw new ManifestError(relPath, "lastUpdated must be YYYY-MM-DD");
  }
  const dateMs = Date.parse(`${lastUpdated}T00:00:00Z`);
  if (Number.isNaN(dateMs)) {
    throw new ManifestError(relPath, "lastUpdated must be a valid date");
  }
  if (lastUpdated > todayISO) {
    throw new ManifestError(relPath, "lastUpdated must not be in the future");
  }

  const slug = raw.slug;
  if (slug !== undefined) {
    if (typeof slug !== "string" || !SLUG_RE.test(slug)) {
      throw new ManifestError(relPath, "slug must be 1–40 chars, lowercase kebab-case (^[a-z][a-z0-9-]{0,39}$)");
    }
  }

  const featurePagePath = raw.featurePagePath;
  if (featurePagePath !== undefined && typeof featurePagePath !== "string") {
    throw new ManifestError(relPath, "featurePagePath must be a string");
  }

  const relatedTopics = raw.relatedTopics;
  if (relatedTopics !== undefined) {
    if (!Array.isArray(relatedTopics) || !relatedTopics.every((r) => typeof r === "string")) {
      throw new ManifestError(relPath, "relatedTopics must be an array of strings");
    }
  }

  return {
    title,
    audience: audience as Audience,
    summary,
    lastUpdated,
    ...(slug !== undefined ? { slug: slug as string } : {}),
    ...(featurePagePath !== undefined ? { featurePagePath: featurePagePath as string } : {}),
    ...(relatedTopics !== undefined ? { relatedTopics: relatedTopics as string[] } : {}),
  };
}

/** Strip frontmatter + JSX/MDX syntax from an MDX body for the search index. */
export function stripBodyForSearch(body: string): string {
  return body
    // Remove HTML/JSX tags (single-line). Repeated to handle nested tags shallowly.
    .replace(/<\/?[A-Za-z][^>]*>/g, " ")
    // Remove fenced code blocks.
    .replace(/```[\s\S]*?```/g, " ")
    // Inline code.
    .replace(/`[^`]+`/g, " ")
    // Markdown link / image syntax — keep the visible text.
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    // Markdown emphasis.
    .replace(/[*_]{1,3}([^*_]+)[*_]{1,3}/g, "$1")
    // Headings.
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    // Collapse whitespace.
    .replace(/\s+/g, " ")
    .trim();
}

export function wordCount(text: string): number {
  if (!text) return 0;
  return text.split(/\s+/).filter(Boolean).length;
}

/**
 * Load every topic under `manualRoot` and return a fully validated list.
 * Throws on the first violation.
 */
export function loadTopics(manualRoot: string, today: Date = new Date()): LoadedTopic[] {
  const todayISO = today.toISOString().slice(0, 10);
  const files = walkMdx(manualRoot);

  const topics: LoadedTopic[] = [];
  // Track slug → relPath per section to detect collisions.
  const slugsBySection = new Map<string, Map<string, string>>();

  for (const absPath of files) {
    const relPath = relative(process.cwd(), absPath).replace(/\\/g, "/");
    const filename = basename(absPath);
    const sectionDir = basename(dirname(absPath));

    const { order: fileOrder, slug: defaultSlug } = parseFilenamePrefix(filename);
    const { order: sectionOrder, id: sectionId } = parseDirectoryPrefix(sectionDir);

    const raw = readFileSync(absPath, "utf-8");
    const parsed = matter(raw);
    const frontmatter = validateFrontmatter(relPath, parsed.data, todayISO);
    const slug = frontmatter.slug ?? defaultSlug;

    if (!SLUG_RE.test(slug)) {
      throw new ManifestError(
        relPath,
        `derived slug "${slug}" must be 1–40 chars, lowercase kebab-case`,
      );
    }

    let sectionSlugs = slugsBySection.get(sectionId);
    if (!sectionSlugs) {
      sectionSlugs = new Map();
      slugsBySection.set(sectionId, sectionSlugs);
    }
    const existing = sectionSlugs.get(slug);
    if (existing) {
      throw new ManifestError(relPath, `slug "${slug}" collides with ${existing}`);
    }
    sectionSlugs.set(slug, relPath);

    topics.push({
      absPath,
      relPath,
      sectionDir,
      sectionId,
      sectionOrder,
      slug,
      order: fileOrder,
      frontmatter,
      body: parsed.content,
    });
  }

  return topics;
}

export { ManifestError };
