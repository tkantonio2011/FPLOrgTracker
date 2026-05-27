"use client";

import { useState } from "react";
import Image from "next/image";
import { Lightbox } from "./Lightbox";
import altMap from "@/content/manual/alt-map.json";

interface AnnotatedImageProps {
  /**
   * Path relative to `public/manual/img/`, e.g. "standings/overview.png".
   * Validated at build time by scripts/build-manual-index.ts.
   */
  src: string;
  /** Caption shown below the image. */
  caption?: string;
  /**
   * Override the alt text from the sidecar `.alt` file. Use sparingly when
   * the same image is reused in a different topic with a different framing.
   */
  alt?: string;
  /** Width override; defaults to a wide-but-not-overflowing 1200. */
  width?: number;
  /** Height override; defaults to 720 (16:9-ish). */
  height?: number;
}

/**
 * Embedded screenshot for manual topics.
 *
 * - Reads alt text from the build-time `alt-map.json` (one sidecar `.alt`
 *   file per PNG; see contracts/topic-frontmatter.md → image conventions).
 * - Wraps `next/image` for AVIF/WebP delivery + responsive sizing.
 * - Opens a `<Lightbox>` on click; the lightbox is keyboard-accessible.
 *
 * Build fails (in `scripts/build-manual-index.ts`) if the referenced image
 * or its sidecar is missing, so a rendered `<AnnotatedImage>` always has a
 * valid image and alt text behind it.
 */
export function AnnotatedImage({
  src,
  caption,
  alt,
  width = 1200,
  height = 720,
}: AnnotatedImageProps) {
  const [open, setOpen] = useState(false);
  const fallbackAlt = (altMap as Record<string, string>)[src] ?? "";
  const effectiveAlt = alt ?? fallbackAlt;
  const url = `/manual/img/${src}`;
  // SVG placeholders bypass next/image (which would require dangerouslyAllowSVG).
  // Real PNG screenshots get the full next/image AVIF/WebP/responsive treatment.
  const isSvg = src.toLowerCase().endsWith(".svg");

  return (
    <figure className="my-6">
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={effectiveAlt ? `Enlarge image: ${effectiveAlt}` : "Enlarge image"}
        className="block w-full rounded-lg overflow-hidden border border-slate-200 hover:border-slate-300 focus-visible:ring-2 focus-visible:ring-[#37003c] focus-visible:outline-none transition-colors bg-white"
      >
        {isSvg ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt={effectiveAlt}
            width={width}
            height={height}
            className="w-full h-auto"
          />
        ) : (
          <Image
            src={url}
            alt={effectiveAlt}
            width={width}
            height={height}
            className="w-full h-auto"
            sizes="(min-width: 768px) 720px, 100vw"
          />
        )}
      </button>
      {caption && (
        <figcaption className="mt-2 text-sm text-slate-500">{caption}</figcaption>
      )}
      {open && (
        <Lightbox
          src={url}
          alt={effectiveAlt}
          caption={caption}
          onClose={() => setOpen(false)}
        />
      )}
    </figure>
  );
}
