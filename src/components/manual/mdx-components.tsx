import type { MDXComponents } from "mdx/types";
import { AnnotatedImage } from "./AnnotatedImage";
import { Callout } from "./Callout";
import { Steps, Step } from "./Steps";
import { KeyboardShortcut } from "./KeyboardShortcut";

/**
 * Components exposed to MDX topic bodies without per-topic imports.
 *
 * Consumed by `app/(main)/help/[...slug]/page.tsx` via `useMDXComponents`,
 * the Next.js App Router MDX integration point.
 */
export const manualMdxComponents: MDXComponents = {
  AnnotatedImage,
  Callout,
  Steps,
  Step,
  KeyboardShortcut,
};
