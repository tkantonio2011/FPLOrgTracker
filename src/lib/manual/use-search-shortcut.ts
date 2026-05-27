"use client";

import { useEffect, type RefObject } from "react";

/**
 * Focuses the given ref when the user presses Cmd-K (macOS) / Ctrl-K
 * (Windows/Linux). preventDefault on the keystroke so the browser's own
 * binding (open the address bar, etc.) doesn't fire.
 *
 * Mounted by ManualLayout once per page; safe to mount multiple times.
 */
export function useSearchShortcut(ref: RefObject<HTMLInputElement>): void {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const isMod = e.metaKey || e.ctrlKey;
      if (isMod && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        ref.current?.focus();
        ref.current?.select?.();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ref]);
}
