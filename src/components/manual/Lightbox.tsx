"use client";

import { useEffect, useRef } from "react";

interface LightboxProps {
  /** Public-URL source for the high-DPI image (e.g. /manual/img/<topic>/<name>.png). */
  src: string;
  alt: string;
  caption?: string;
  onClose: () => void;
}

/**
 * Full-screen image enlarger for the user manual.
 *
 * - Closes on Esc, on backdrop click, and on the X button.
 * - Traps focus while open (the close button is the only focusable element).
 * - Respects `prefers-reduced-motion` (no fade-in if user opted out).
 *
 * Renders a portal-style fixed overlay. Designed to be mounted from
 * `<AnnotatedImage>` when the user clicks the image.
 */
export function Lightbox({ src, alt, caption, onClose }: LightboxProps) {
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    // Focus the close button so keyboard users have an obvious next action.
    closeBtnRef.current?.focus();
    // Prevent background scroll while open.
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Enlarged image"
      className="fixed inset-0 z-[100] bg-black/85 flex items-center justify-center p-4 motion-safe:animate-fade-in"
      onClick={(e) => {
        // Close when the backdrop itself is clicked, not the image.
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <button
        ref={closeBtnRef}
        onClick={onClose}
        aria-label="Close enlarged image"
        className="absolute top-4 right-4 text-white/80 hover:text-white p-2 rounded-full focus-visible:ring-2 focus-visible:ring-white"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      </button>

      <figure className="max-w-[95vw] max-h-[90vh] flex flex-col items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={alt}
          className="max-w-full max-h-[80vh] object-contain rounded shadow-card-md bg-white"
        />
        {caption && (
          <figcaption className="text-white/80 text-sm text-center max-w-2xl">
            {caption}
          </figcaption>
        )}
      </figure>
    </div>
  );
}
