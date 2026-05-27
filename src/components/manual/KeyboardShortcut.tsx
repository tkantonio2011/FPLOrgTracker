"use client";

import { useEffect, useState } from "react";

interface KeyboardShortcutProps {
  /**
   * Logical key names. `Cmd` is automatically rendered as `Ctrl` on non-Mac
   * platforms; other keys are passed through.
   */
  keys: string[];
}

/**
 * Renders an inline `<kbd>` representation of a keyboard shortcut.
 * OS-aware: `Cmd` displays as `Ctrl` on Windows/Linux.
 */
export function KeyboardShortcut({ keys }: KeyboardShortcutProps) {
  const isMac = useIsMac();
  const rendered = keys.map((k) => (k === "Cmd" ? (isMac ? "⌘" : "Ctrl") : k));
  return (
    <span className="not-prose inline-flex items-center gap-1 align-baseline">
      {rendered.map((label, i) => (
        <span key={`${label}-${i}`} className="inline-flex items-center gap-1">
          <kbd className="inline-flex items-center px-1.5 py-0.5 rounded border border-slate-300 bg-slate-50 text-slate-700 font-mono text-[11px] leading-none shadow-sm">
            {label}
          </kbd>
          {i < rendered.length - 1 && <span className="text-slate-400 text-xs">+</span>}
        </span>
      ))}
    </span>
  );
}

function useIsMac(): boolean {
  const [isMac, setIsMac] = useState(false);
  useEffect(() => {
    if (typeof navigator === "undefined") return;
    const platform = navigator.platform ?? "";
    const ua = navigator.userAgent ?? "";
    setIsMac(/Mac|iPhone|iPad|iPod/.test(platform) || /Macintosh/.test(ua));
  }, []);
  return isMac;
}
