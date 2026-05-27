import type { ReactNode } from "react";

type CalloutType = "note" | "tip" | "warning";

interface CalloutProps {
  type: CalloutType;
  /** Heading override; defaults to the title-case form of `type`. */
  title?: string;
  children: ReactNode;
}

const STYLES: Record<CalloutType, { container: string; title: string; icon: ReactNode }> = {
  note: {
    container: "bg-[#37003c]/5 border-l-4 border-[#37003c] text-slate-800",
    title: "text-[#37003c]",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="16" x2="12" y2="12" />
        <line x1="12" y1="8" x2="12.01" y2="8" />
      </svg>
    ),
  },
  tip: {
    container: "bg-emerald-50 border-l-4 border-emerald-500 text-slate-800",
    title: "text-emerald-700",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 18h6" />
        <path d="M10 22h4" />
        <path d="M12 2a7 7 0 0 0-4 12.74V17h8v-2.26A7 7 0 0 0 12 2z" />
      </svg>
    ),
  },
  warning: {
    container: "bg-amber-50 border-l-4 border-amber-500 text-slate-800",
    title: "text-amber-700",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" />
        <path d="M12 9v4" />
        <path d="M12 17h.01" />
      </svg>
    ),
  },
};

const DEFAULT_TITLES: Record<CalloutType, string> = {
  note: "Note",
  tip: "Tip",
  warning: "Warning",
};

/**
 * Inline callout block for manual topics. Three variants:
 * `note` (purple, neutral context), `tip` (green, helpful aside),
 * `warning` (amber, destructive or hard-to-undo actions).
 *
 * Renders inside the `prose` container without breaking typography flow.
 */
export function Callout({ type, title, children }: CalloutProps) {
  const style = STYLES[type];
  const heading = title ?? DEFAULT_TITLES[type];
  return (
    <aside className={`not-prose my-6 rounded-r-lg px-4 py-3 ${style.container}`}>
      <div className={`flex items-center gap-2 font-semibold mb-1 ${style.title}`}>
        {style.icon}
        <span>{heading}</span>
      </div>
      <div className="text-sm leading-relaxed text-slate-700">{children}</div>
    </aside>
  );
}
