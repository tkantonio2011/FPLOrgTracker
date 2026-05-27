/**
 * Build-time generator for the in-app user manual (003-user-manual).
 *
 * Walks `src/content/manual/`, validates frontmatter via `loadTopics`,
 * reads optional `_section.json` per section directory, validates every
 * `<AnnotatedImage src="...">` reference against `public/manual/img/` AND
 * asserts a sibling `.alt` sidecar exists, then emits:
 *
 *   - src/content/manual/manifest.ts       — typed manifest for the renderer
 *   - src/content/manual/search-index.json — JSON consumed by Fuse on the client
 *   - src/content/manual/alt-map.json      — image src → alt text mapping
 *
 * Run via `npm run prebuild` (chained from `npm run build`). Safe to re-run.
 *
 * Empty content directory is OK — the generator emits empty manifest + index.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { loadTopics, stripBodyForSearch, wordCount, ManifestError } from "../src/lib/manual/load-topics";
import type {
  Audience,
  ManifestSection,
  ManifestTopic,
  ManualManifest,
  SearchIndex,
  SearchIndexEntry,
} from "../src/lib/manual/types";

const REPO_ROOT = process.cwd();
const CONTENT_ROOT = join(REPO_ROOT, "src", "content", "manual");
const IMG_ROOT = join(REPO_ROOT, "public", "manual", "img");
const MANIFEST_OUT = join(CONTENT_ROOT, "manifest.ts");
const SEARCH_OUT = join(CONTENT_ROOT, "search-index.json");
const ALT_MAP_OUT = join(CONTENT_ROOT, "alt-map.json");
const MODULES_OUT = join(CONTENT_ROOT, "modules.ts");

const VALID_AUDIENCES: ReadonlySet<Audience> = new Set<Audience>(["member", "admin", "both"]);

interface SectionMeta {
  id?: string;
  title?: string;
  summary?: string;
  primaryAudience?: Audience;
}

interface SectionInfo {
  id: string;
  order: number;
  title: string;
  summary: string;
  primaryAudience: Audience;
  dirName: string;
}

function titleCase(s: string): string {
  return s
    .split("-")
    .filter(Boolean)
    .map((p) => p[0]!.toUpperCase() + p.slice(1))
    .join(" ");
}

function loadSectionMeta(sectionDir: string): SectionMeta {
  const path = join(CONTENT_ROOT, sectionDir, "_section.json");
  if (!existsSync(path)) return {};
  const raw = readFileSync(path, "utf-8");
  try {
    return JSON.parse(raw) as SectionMeta;
  } catch (err) {
    throw new Error(`[manifest] ${sectionDir}/_section.json: invalid JSON (${(err as Error).message})`);
  }
}

/**
 * Find every `<AnnotatedImage src="..." />` reference in `body` and validate:
 *  - the file exists under public/manual/img/
 *  - a sibling .alt sidecar exists
 * Returns the [src, alt] pairs.
 */
function collectAndValidateImages(body: string, relPath: string): Array<{ src: string; alt: string }> {
  // PNG is the production format; SVG is accepted so authors can ship
  // placeholders alongside real screenshots without breaking the build.
  const SRC_RE = /<AnnotatedImage\s+[^>]*?src=["']([^"']+\.(?:png|svg))["'][^>]*?\/?>/g;
  const out: Array<{ src: string; alt: string }> = [];
  for (const match of body.matchAll(SRC_RE)) {
    const src = match[1]!;
    const imgPath = join(IMG_ROOT, src);
    if (!existsSync(imgPath)) {
      throw new Error(
        `[manifest] image "${src}" referenced by ${relPath} but does not exist at public/manual/img/${src}`,
      );
    }
    const altPath = `${imgPath}.alt`;
    if (!existsSync(altPath)) {
      throw new Error(
        `[manifest] image "${src}" referenced by ${relPath} lacks a sibling .alt file at public/manual/img/${src}.alt`,
      );
    }
    const alt = readFileSync(altPath, "utf-8").trim();
    if (alt.length === 0) {
      throw new Error(`[manifest] alt-text sidecar for "${src}" is empty`);
    }
    out.push({ src, alt });
  }
  return out;
}

function main(): void {
  if (!existsSync(CONTENT_ROOT)) {
    mkdirSync(CONTENT_ROOT, { recursive: true });
  }

  let topics;
  try {
    topics = loadTopics(CONTENT_ROOT);
  } catch (err) {
    if (err instanceof ManifestError) {
      console.error(err.message);
      process.exit(1);
    }
    throw err;
  }

  // Group topics by section.
  const sectionsById = new Map<string, SectionInfo>();
  for (const t of topics) {
    if (sectionsById.has(t.sectionId)) continue;
    const meta = loadSectionMeta(t.sectionDir);
    const audience = meta.primaryAudience ?? "both";
    if (!VALID_AUDIENCES.has(audience)) {
      throw new Error(
        `[manifest] ${t.sectionDir}/_section.json: primaryAudience must be "member","admin","both"`,
      );
    }
    sectionsById.set(t.sectionId, {
      id: meta.id ?? t.sectionId,
      order: t.sectionOrder,
      title: meta.title ?? titleCase(t.sectionId),
      summary: meta.summary ?? "",
      primaryAudience: audience,
      dirName: t.sectionDir,
    });
  }

  // Collect images + alt text, sorted by topic.
  const altMap: Record<string, string> = {};
  const topicImageBySrc = new Map<string, string>(); // src → alt

  const manifestTopicsByPath = new Map<string, ManifestTopic>();
  const sectionTopicLists = new Map<string, ManifestTopic[]>();

  for (const t of topics) {
    const images = collectAndValidateImages(t.body, t.relPath);
    for (const img of images) {
      // First seen wins; subsequent identical src/alt is idempotent.
      if (!altMap[img.src]) altMap[img.src] = img.alt;
    }

    const section = sectionsById.get(t.sectionId)!;
    const path = `/help/${section.id}/${t.slug}`;
    const sectionPath = `/help/${section.id}`;

    const cleanBody = stripBodyForSearch(t.body);

    const manifestTopic: ManifestTopic = {
      slug: t.slug,
      title: t.frontmatter.title,
      audience: t.frontmatter.audience,
      summary: t.frontmatter.summary,
      lastUpdated: t.frontmatter.lastUpdated,
      path,
      sectionId: section.id,
      sectionTitle: section.title,
      order: t.order,
      wordCount: wordCount(cleanBody),
      featurePagePath: t.frontmatter.featurePagePath ?? null,
      relatedTopics: t.frontmatter.relatedTopics ?? [],
    };

    manifestTopicsByPath.set(path, manifestTopic);
    if (!sectionTopicLists.has(section.id)) {
      sectionTopicLists.set(section.id, []);
    }
    sectionTopicLists.get(section.id)!.push(manifestTopic);

    // Track for related-topic resolution below.
    topicImageBySrc.set(path, t.relPath);
  }

  // Resolve relatedTopics — every entry must point at a known path.
  for (const topic of manifestTopicsByPath.values()) {
    for (const rel of topic.relatedTopics) {
      if (!manifestTopicsByPath.has(rel)) {
        throw new Error(
          `[manifest] ${topic.path}: relatedTopic "${rel}" does not resolve`,
        );
      }
    }
  }

  // Sort topics within each section by order, then assemble sections sorted by order.
  const sections: ManifestSection[] = [];
  for (const [id, info] of [...sectionsById.entries()].sort(
    (a, b) => a[1].order - b[1].order,
  )) {
    const list = (sectionTopicLists.get(id) ?? []).slice().sort((a, b) => a.order - b.order);
    sections.push({
      id: info.id,
      order: info.order,
      title: info.title,
      summary: info.summary,
      primaryAudience: info.primaryAudience,
      path: `/help/${info.id}`,
      topics: list,
    });
  }

  const manifest: ManualManifest = {
    generatedAt: new Date().toISOString(),
    sections,
  };

  // Emit manifest.ts.
  const manifestSource = `// AUTO-GENERATED by scripts/build-manual-index.ts. Do not edit by hand.
// Re-run \`npm run prebuild\` to regenerate.

import type { ManualManifest } from "@/lib/manual/types";

export const manualManifest: ManualManifest = ${JSON.stringify(manifest, null, 2)};
`;
  writeFileSync(MANIFEST_OUT, manifestSource, "utf-8");

  // Emit search-index.json.
  const searchIndex: SearchIndex = [];
  for (const t of topics) {
    const section = sectionsById.get(t.sectionId)!;
    const path = `/help/${section.id}/${t.slug}`;
    const body = stripBodyForSearch(t.body).slice(0, 5000);
    const entry: SearchIndexEntry = {
      slug: t.slug,
      path,
      title: t.frontmatter.title,
      audience: t.frontmatter.audience,
      sectionId: section.id,
      sectionTitle: section.title,
      summary: t.frontmatter.summary,
      body,
    };
    searchIndex.push(entry);
  }
  writeFileSync(SEARCH_OUT, JSON.stringify(searchIndex, null, 2), "utf-8");

  // Emit alt-map.json (used by AnnotatedImage to resolve alt text at render time).
  writeFileSync(ALT_MAP_OUT, JSON.stringify(altMap, null, 2), "utf-8");

  // Emit modules.ts — a static map from canonical /help path → dynamic import
  // of the matching MDX file. The bundler sees each `import(...)` call with a
  // literal path, so it can statically resolve them at build time.
  const moduleEntries: string[] = [];
  for (const t of topics) {
    const section = sectionsById.get(t.sectionId)!;
    const path = `/help/${section.id}/${t.slug}`;
    // Relative path from CONTENT_ROOT to the MDX file, using forward slashes.
    const relMdx = `./${t.sectionDir}/${basename(t.absPath)}`.replace(/\\/g, "/");
    moduleEntries.push(`  ${JSON.stringify(path)}: () => import(${JSON.stringify(relMdx)}),`);
  }
  const modulesSource = `// AUTO-GENERATED by scripts/build-manual-index.ts. Do not edit by hand.
// Re-run \`npm run prebuild\` to regenerate.

import type { ComponentType } from "react";

export type ManualModuleLoader = () => Promise<{ default: ComponentType }>;

export const manualModules: Record<string, ManualModuleLoader> = {
${moduleEntries.join("\n")}
};
`;
  writeFileSync(MODULES_OUT, modulesSource, "utf-8");

  console.log(
    `[build-manual-index] wrote ${topics.length} topics across ${sections.length} sections.`,
  );
}

main();
