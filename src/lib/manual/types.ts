/**
 * Shared types for the in-app user manual (003-user-manual).
 *
 * Mirrors the shapes documented in specs/003-user-manual/data-model.md.
 * Authoring rules are enforced by scripts/build-manual-index.ts.
 */

export type Audience = "member" | "admin" | "both";

export interface ManifestTopic {
  slug: string;
  title: string;
  audience: Audience;
  summary: string;
  lastUpdated: string; // YYYY-MM-DD
  path: string;
  sectionId: string;
  sectionTitle: string;
  order: number;
  wordCount: number;
  featurePagePath: string | null;
  relatedTopics: string[];
}

export interface ManifestSection {
  id: string;
  order: number;
  title: string;
  summary: string;
  primaryAudience: Audience;
  path: string;
  topics: ManifestTopic[];
}

export interface ManualManifest {
  generatedAt: string;
  sections: ManifestSection[];
}

export interface SearchIndexEntry {
  slug: string;
  path: string;
  title: string;
  audience: Audience;
  sectionId: string;
  sectionTitle: string;
  summary: string;
  body: string;
}

export type SearchIndex = SearchIndexEntry[];

/**
 * The role lens used to order sections in the TOC.
 * `admin` users see the admin section first; `member` users see it last.
 */
export type ViewerRole = "member" | "admin";
