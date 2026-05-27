/**
 * Manual URL redirect table.
 *
 * When a topic is renamed or moved, add an entry mapping the old canonical path
 * to the new one. The dynamic route at `src/app/(main)/help/[...slug]/page.tsx`
 * honours these as 308 Permanent Redirects, keeping bookmarks and shared links
 * alive across the rename.
 *
 * Empty for v1 — populate as content is renamed in future releases.
 *
 * Contract: specs/003-user-manual/contracts/topic-frontmatter.md#renaming-a-topic
 */
export const manualRedirects: Record<string, string> = {};
