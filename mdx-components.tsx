import type { MDXComponents } from "mdx/types";
import { manualMdxComponents } from "@/components/manual/mdx-components";

/**
 * Next.js App Router MDX integration point.
 *
 * `@next/mdx` calls this function once per MDX file render and merges the
 * returned components with any per-file imports. We expose the manual's
 * inline components (AnnotatedImage, Callout, Steps, KeyboardShortcut, etc.)
 * here so authors don't have to import them in every topic.
 *
 * Reference: https://nextjs.org/docs/app/guides/mdx
 */
export function useMDXComponents(components: MDXComponents): MDXComponents {
  return {
    ...components,
    ...manualMdxComponents,
  };
}
